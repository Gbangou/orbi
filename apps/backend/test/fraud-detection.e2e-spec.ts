/**
 * FraudDetection — Tests unitaires sur la détection de fraude
 *
 * Ces tests vérifient la logique métier de détection:
 * - Velocity checks (ride requests, payments)
 * - GPS spoofing detection
 * - Bulk account creation
 */
import { FraudDetectionService } from '../src/common/security/fraud-detection.service';

function createService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    rideRequest: { count: jest.fn().mockResolvedValue(0) },
    paymentAttempt: { count: jest.fn().mockResolvedValue(0) },
    user: { count: jest.fn().mockResolvedValue(0) },
    driverProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
  return { prisma, service: new FraudDetectionService(prisma as never) };
}

describe('FraudDetectionService — ride request velocity', () => {
  it('autorise 4 demandes en 10 min (sous le seuil)', async () => {
    const { service, prisma } = createService();
    (prisma.rideRequest.count as jest.Mock).mockResolvedValue(4);
    const result = await service.isRideRequestVelocityExceeded('rider-1');
    expect(result).toBe(false);
  });

  it('bloque 5 demandes en 10 min (seuil atteint)', async () => {
    const { service, prisma } = createService();
    (prisma.rideRequest.count as jest.Mock).mockResolvedValue(5);
    const result = await service.isRideRequestVelocityExceeded('rider-1');
    expect(result).toBe(true);
  });

  it('bloque 10 demandes (nettement au-dessus du seuil)', async () => {
    const { service, prisma } = createService();
    (prisma.rideRequest.count as jest.Mock).mockResolvedValue(10);
    const result = await service.isRideRequestVelocityExceeded('rider-1');
    expect(result).toBe(true);
  });

  it('autorise 0 demandes (premier usage)', async () => {
    const { service, prisma } = createService();
    (prisma.rideRequest.count as jest.Mock).mockResolvedValue(0);
    const result = await service.isRideRequestVelocityExceeded('rider-new');
    expect(result).toBe(false);
  });
});

describe('FraudDetectionService — payment velocity', () => {
  it('autorise 3 tentatives en 30 min', async () => {
    const { service, prisma } = createService();
    (prisma.paymentAttempt.count as jest.Mock).mockResolvedValue(3);
    const result = await service.isPaymentVelocityExceeded('request-1');
    expect(result).toBe(false);
  });

  it('bloque 4 tentatives ou plus (card testing)', async () => {
    const { service, prisma } = createService();
    (prisma.paymentAttempt.count as jest.Mock).mockResolvedValue(4);
    const result = await service.isPaymentVelocityExceeded('request-1');
    expect(result).toBe(true);
  });

  it('respecte la fenêtre personnalisée', async () => {
    const { service, prisma } = createService();
    (prisma.paymentAttempt.count as jest.Mock).mockResolvedValue(3);
    // Avec maxAttempts=3: 3 tentatives = bloqué
    const result = await service.isPaymentVelocityExceeded('request-1', 30, 3);
    expect(result).toBe(true);
  });
});

describe('FraudDetectionService — bulk account creation', () => {
  it('autorise les domaines grand public (gmail)', async () => {
    const { service } = createService();
    const result = await service.isBulkAccountCreationSuspected('user@gmail.com');
    expect(result).toBe(false);
  });

  it('autorise les domaines grand public (yahoo)', async () => {
    const { service } = createService();
    const result = await service.isBulkAccountCreationSuspected('user@yahoo.com');
    expect(result).toBe(false);
  });

  it('autorise les domaines locaux burkinabé (orange.bf)', async () => {
    const { service } = createService();
    const result = await service.isBulkAccountCreationSuspected('user@orange.bf');
    expect(result).toBe(false);
  });

  it('signale un domaine entreprise avec 5 créations en 1h', async () => {
    const { service, prisma } = createService();
    (prisma.user.count as jest.Mock).mockResolvedValue(5);
    const result = await service.isBulkAccountCreationSuspected('attacker@suspicious-corp.com');
    expect(result).toBe(true);
  });

  it('autorise un domaine entreprise avec 4 créations', async () => {
    const { service, prisma } = createService();
    (prisma.user.count as jest.Mock).mockResolvedValue(4);
    const result = await service.isBulkAccountCreationSuspected('user@mycompany.com');
    expect(result).toBe(false);
  });

  it('retourne false si email sans domaine', async () => {
    const { service } = createService();
    const result = await service.isBulkAccountCreationSuspected('invalidemail');
    expect(result).toBe(false);
  });
});

describe('FraudDetectionService — GPS spoofing', () => {
  it('autorise un déplacement raisonnable (30 km/h)', async () => {
    const { service, prisma } = createService();
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue({
      currentLatitude: 12.37,
      currentLongitude: -1.52,
      updatedAt: oneHourAgo, // 1h ago
    });
    // 12.37 -> 12.64: environ 30 km en 1h = 30 km/h — OK
    const result = await service.isGpsSpoofingSuspected('driver-1', 12.64, -1.52);
    expect(result).toBe(false);
  });

  it('détecte un déplacement impossible (>200 km/h)', async () => {
    const { service, prisma } = createService();
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue({
      currentLatitude: 12.37,
      currentLongitude: -1.52,
      updatedAt: oneMinuteAgo, // 1 min ago
    });
    // Déplacement de 300 km en 1 minute = 18 000 km/h — spoofing évident
    const result = await service.isGpsSpoofingSuspected('driver-1', 15.0, 2.0);
    expect(result).toBe(true);
  });

  it('retourne false si pas de position précédente', async () => {
    const { service, prisma } = createService();
    (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await service.isGpsSpoofingSuspected('driver-new', 12.37, -1.52);
    expect(result).toBe(false);
  });

  it('retourne false si position précédente sans lat/lng', async () => {
    const { service, prisma } = createService();
    (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue({
      currentLatitude: null,
      currentLongitude: null,
      updatedAt: new Date(),
    });
    const result = await service.isGpsSpoofingSuspected('driver-1', 12.37, -1.52);
    expect(result).toBe(false);
  });
});
