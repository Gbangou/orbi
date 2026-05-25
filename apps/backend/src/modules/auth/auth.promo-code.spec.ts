import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

const now = new Date('2026-06-15T12:00:00.000Z');

function basePromo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo-1',
    code: 'BIENVENUE20',
    description: 'Code premier trajet',
    discountBps: 2000,
    maxUses: 100,
    usedCount: 5,
    validFrom: new Date('2026-06-01T00:00:00.000Z'),
    validTo: new Date('2026-12-31T23:59:59.000Z'),
    firstTripOnly: false,
    active: true,
    ...overrides,
  };
}

function createService(promoOverrides: Record<string, unknown> = {}) {
  const promo = basePromo(promoOverrides);
  const prisma = {
    promoCode: {
      findUnique: jest.fn().mockResolvedValue(promo),
    },
    riderProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'rider-1' }),
    },
    trip: {
      count: jest.fn().mockResolvedValue(0),
    },
    user: { findUnique: jest.fn(), update: jest.fn() },
    userSession: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  const service = new AuthService(prisma as never, {} as never);
  const auth = {
    user: { id: 'user-1', role: 'RIDER', fullName: 'Awa Rider' },
  };

  return { prisma, service, auth };
}

jest.useFakeTimers().setSystemTime(now);

describe('AuthService.validatePromoCode', () => {
  it('retourne les details du code valide avec le pourcentage de remise', async () => {
    const { service, auth } = createService();
    const result = await service.validatePromoCode('bienvenue20', auth as never);

    expect(result.valid).toBe(true);
    expect(result.code).toBe('BIENVENUE20');
    expect(result.discountBps).toBe(2000);
    expect(result.discountPercent).toBe(20);
    expect(typeof result.validTo).toBe('string');
  });

  it('normalise le code en majuscules avant la recherche', async () => {
    const { service, prisma, auth } = createService();
    await service.validatePromoCode('bienvenue20', auth as never);

    expect(prisma.promoCode.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'BIENVENUE20' } }),
    );
  });

  it('lance BadRequestException si le code est introuvable ou inactif', async () => {
    const { service, prisma, auth } = createService();
    prisma.promoCode.findUnique.mockResolvedValue(null);

    await expect(
      service.validatePromoCode('INEXISTANT', auth as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('lance BadRequestException si le code est inactif', async () => {
    const { service, auth } = createService({ active: false });

    await expect(
      service.validatePromoCode('BIENVENUE20', auth as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('lance BadRequestException si le code est expire (validTo dans le passe)', async () => {
    const { service, auth } = createService({
      validTo: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.validatePromoCode('BIENVENUE20', auth as never),
    ).rejects.toThrow(BadRequestException);
  });

  it("lance BadRequestException si le code n'est pas encore actif (validFrom dans le futur)", async () => {
    const { service, auth } = createService({
      validFrom: new Date('2027-01-01T00:00:00.000Z'),
    });

    await expect(
      service.validatePromoCode('BIENVENUE20', auth as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('lance BadRequestException si le nombre max utilisations est atteint', async () => {
    const { service, auth } = createService({ maxUses: 5, usedCount: 5 });

    await expect(
      service.validatePromoCode('BIENVENUE20', auth as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepte un code sans limite d utilisations (maxUses null)', async () => {
    const { service, auth } = createService({ maxUses: null, usedCount: 9999 });
    const result = await service.validatePromoCode('BIENVENUE20', auth as never);

    expect(result.valid).toBe(true);
  });

  it('accepte un code firstTripOnly si le rider na aucun trajet complete', async () => {
    const { service, auth } = createService({ firstTripOnly: true });
    const result = await service.validatePromoCode('BIENVENUE20', auth as never);

    expect(result.valid).toBe(true);
    expect(result.firstTripOnly).toBe(true);
  });

  it('rejette un code firstTripOnly si le rider a deja des trajets completes', async () => {
    const { service, prisma, auth } = createService({ firstTripOnly: true });
    prisma.trip.count.mockResolvedValue(3);

    await expect(
      service.validatePromoCode('BIENVENUE20', auth as never),
    ).rejects.toThrow(BadRequestException);
  });
});
