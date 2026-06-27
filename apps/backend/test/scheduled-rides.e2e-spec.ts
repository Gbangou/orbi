/**
 * Scheduled Rides — Tests d'intégration E2E
 *
 * Vérifie la validation métier:
 * - Minimum 30 min avance
 * - Maximum 7 jours
 * - 1 seule course active par passager
 * - Annulation avec protection
 */
import { ScheduledRidesService } from '../src/modules/scheduled-rides/scheduled-rides.service';
import type { RequestAuthContext } from '../src/modules/auth/auth.types';

function createService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    riderProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'rider-1' }),
    },
    scheduledRide: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'ride-1',
        ...data,
        status: 'PENDING', // Prisma default — must be explicit in mock
        estimatedFare: null,
        tripId: null,
        cancelledAt: null,
        cancellationReason: null,
        dispatchStartedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: jest.fn().mockImplementation(({ data }) => ({
        id: 'ride-1',
        status: data.status ?? 'PENDING',
        cancelledAt: data.cancelledAt ?? null,
        cancellationReason: data.cancellationReason ?? null,
        scheduledFor: new Date(Date.now() + 60 * 60_000),
        pickupAddress: 'Université Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        vehicleType: 'MOTORCYCLE',
        paymentMethod: 'MOBILE_MONEY',
        city: 'OUAGADOUGOU',
        estimatedFare: null,
        notes: null,
        promoCode: null,
        createdAt: new Date(),
      })),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    ...prismaOverrides,
  };

  const auth: RequestAuthContext = {
    user: { id: 'user-1', role: 'RIDER', email: 'test@example.com', fullName: 'Test User', isActive: true },
  } as RequestAuthContext;

  return { prisma, service: new ScheduledRidesService(prisma as never), auth };
}

function futureDate(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

describe('ScheduledRidesService — validation métier', () => {

  describe('createScheduledRide', () => {
    it('accepte une réservation 2h à l\'avance', async () => {
      const { service, auth } = createService();
      const ride = await service.createScheduledRide(auth, {
        pickupAddress: 'Université Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        scheduledFor: futureDate(120),
        vehicleType: 'MOTORCYCLE',
      });
      expect(ride.id).toBeDefined();
      expect(ride.status).toBe('PENDING');
      expect(ride.canCancel).toBe(true);
    });

    it('rejette une réservation < 30 min à l\'avance', async () => {
      const { service, auth } = createService();
      await expect(
        service.createScheduledRide(auth, {
          pickupAddress: 'Test',
          destinationAddress: 'Destination',
          scheduledFor: futureDate(15), // Trop tôt
        }),
      ).rejects.toThrow('au moins 30 minutes');
    });

    it('rejette une réservation > 7 jours à l\'avance', async () => {
      const { service, auth } = createService();
      await expect(
        service.createScheduledRide(auth, {
          pickupAddress: 'Test',
          destinationAddress: 'Destination',
          scheduledFor: futureDate(60 * 24 * 8), // 8 jours
        }),
      ).rejects.toThrow('7 jours');
    });

    it('rejette une date invalide', async () => {
      const { service, auth } = createService();
      await expect(
        service.createScheduledRide(auth, {
          pickupAddress: 'Test',
          destinationAddress: 'Destination',
          scheduledFor: 'not-a-date',
        }),
      ).rejects.toThrow('ISO 8601');
    });

    it('bloque une 2ème réservation active', async () => {
      const { service, auth } = createService({
        scheduledRide: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'existing-ride',
            scheduledFor: new Date(Date.now() + 2 * 60 * 60_000),
          }),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      });
      await expect(
        service.createScheduledRide(auth, {
          pickupAddress: 'Test',
          destinationAddress: 'Destination',
          scheduledFor: futureDate(60),
        }),
      ).rejects.toThrow('déjà une course programmée');
    });

    it('retourne canCancel=true pour une course PENDING loin dans le futur', async () => {
      const { service, auth } = createService();
      const ride = await service.createScheduledRide(auth, {
        pickupAddress: 'Test pickup',
        destinationAddress: 'Test destination',
        scheduledFor: futureDate(240), // 4h dans le futur
      });
      expect(ride.canCancel).toBe(true);
      expect(ride.minutesUntilPickup).toBeGreaterThan(200);
    });

    it('crée un audit log à chaque création', async () => {
      const { service, auth, prisma } = createService();
      await service.createScheduledRide(auth, {
        pickupAddress: 'Test',
        destinationAddress: 'Dest',
        scheduledFor: futureDate(60),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SCHEDULED_RIDE_CREATED',
            entityType: 'SCHEDULED_RIDE',
          }),
        }),
      );
    });
  });

  describe('cancelScheduledRide', () => {
    it('annule une course PENDING sans restriction', async () => {
      const { service, auth } = createService({
        scheduledRide: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue({
            id: 'ride-1',
            riderId: 'rider-1',
            status: 'PENDING',
            scheduledFor: new Date(Date.now() + 2 * 60 * 60_000),
          }),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({
            id: 'ride-1', status: 'CANCELLED', cancelledAt: new Date(),
            cancellationReason: 'Test', scheduledFor: new Date(), pickupAddress: '',
            destinationAddress: '', vehicleType: 'MOTORCYCLE', paymentMethod: 'CASH',
            city: 'OUAGADOUGOU', estimatedFare: null, notes: null, promoCode: null, createdAt: new Date(),
          }),
        },
      });
      const result = await service.cancelScheduledRide(auth, 'ride-1', 'Changement de plan');
      expect(result.status).toBe('CANCELLED');
    });

    it('refuse l\'annulation d\'une course COMPLETED', async () => {
      const { service, auth } = createService({
        scheduledRide: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue({
            id: 'ride-1',
            riderId: 'rider-1',
            status: 'COMPLETED',
            scheduledFor: new Date(),
          }),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
      });
      await expect(
        service.cancelScheduledRide(auth, 'ride-1'),
      ).rejects.toThrow('terminée');
    });

    it('refuse l\'annulation d\'une course d\'un autre passager', async () => {
      const { service, auth } = createService({
        scheduledRide: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue({
            id: 'ride-1',
            riderId: 'other-rider', // Différent
            status: 'PENDING',
            scheduledFor: new Date(Date.now() + 3 * 60 * 60_000),
          }),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
      });
      await expect(
        service.cancelScheduledRide(auth, 'ride-1'),
      ).rejects.toThrow('not belong to you');
    });

    it('retourne 404 si la course n\'existe pas', async () => {
      const { service, auth } = createService({
        scheduledRide: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null), // Non trouvé
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
      });
      await expect(
        service.cancelScheduledRide(auth, 'nonexistent'),
      ).rejects.toThrow('not found');
    });
  });

  describe('listMyScheduledRides', () => {
    it('retourne les courses récentes du passager', async () => {
      const rides = [
        { id: 'r1', pickupAddress: 'A', destinationAddress: 'B', scheduledFor: new Date(Date.now() + 60 * 60_000), vehicleType: 'MOTORCYCLE', paymentMethod: 'MOBILE_MONEY', city: 'OUAGADOUGOU', status: 'PENDING', estimatedFare: null, notes: null, promoCode: null, cancelledAt: null, cancellationReason: null, createdAt: new Date() },
      ];
      const { service, auth } = createService({
        scheduledRide: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue(rides),
          update: jest.fn(),
        },
      });
      const result = await service.listMyScheduledRides(auth);
      expect(result.rides).toHaveLength(1);
      expect(result.rides[0].id).toBe('r1');
    });

    it('retourne une liste vide si pas de profil rider', async () => {
      const { service, auth } = createService({
        riderProfile: { findUnique: jest.fn().mockResolvedValue(null) },
        scheduledRide: {
          findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]), update: jest.fn(),
        },
      });
      const result = await service.listMyScheduledRides(auth);
      expect(result.rides).toHaveLength(0);
    });
  });
});
