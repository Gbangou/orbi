import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { parseStrictPromoCodeDate } from './admin-promo-code-dates';
import { AdminService } from './admin.service';

function createService() {
  const baseCode = () => ({
    id: 'promo-1',
    code: 'BIENVENUE20',
    description: 'Code premier trajet',
    discountBps: 2000,
    maxUses: 100,
    usedCount: 5,
    validFrom: new Date('2026-06-01T00:00:00.000Z'),
    validTo: new Date('2026-12-31T23:59:59.000Z'),
    firstTripOnly: true,
    active: true,
    createdAt: new Date('2026-05-25T10:00:00.000Z'),
    updatedAt: new Date('2026-05-25T10:00:00.000Z'),
  });

  const prisma = {
    promoCode: {
      findMany: jest.fn().mockResolvedValue([baseCode()]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(baseCode()),
      update: jest.fn().mockResolvedValue({ ...baseCode(), active: false }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  };

  const service = new AdminService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { enqueue: jest.fn() } as never,
    { getOrSet: (_k: string, factory: () => unknown) => factory() } as never,
  );

  const auth = {
    user: { id: 'admin-1', role: 'ADMIN', fullName: 'Admin Test' },
  };

  return { prisma, service, auth, baseCode };
}

describe('AdminService.listPromoCodes', () => {
  it('retourne la liste des codes promo avec les champs ISO', async () => {
    const { service } = createService();
    const result = await service.listPromoCodes();

    expect(result.promoCodes).toHaveLength(1);
    expect(result.promoCodes[0]).toMatchObject({
      id: 'promo-1',
      code: 'BIENVENUE20',
      discountBps: 2000,
      usedCount: 5,
      active: true,
    });
    expect(typeof result.promoCodes[0].validFrom).toBe('string');
    expect(typeof result.promoCodes[0].createdAt).toBe('string');
  });
});

describe('AdminService.createPromoCode', () => {
  it('parse strictement les dates promo comme de vrais instants UTC ISO', () => {
    expect(
      parseStrictPromoCodeDate('2026-06-01T00:00:00.000Z')?.toISOString(),
    ).toBe('2026-06-01T00:00:00.000Z');
    expect(
      parseStrictPromoCodeDate('2026-06-01T08:30:15Z')?.toISOString(),
    ).toBe('2026-06-01T08:30:15.000Z');
    expect(parseStrictPromoCodeDate('2026-02-31T00:00:00.000Z')).toBeNull();
    expect(parseStrictPromoCodeDate('2026-06-01')).toBeNull();
    expect(parseStrictPromoCodeDate('not-a-date')).toBeNull();
  });

  it('cree un code promo et enregistre un audit log', async () => {
    const { service, prisma, auth } = createService();
    const result = await service.createPromoCode(
      {
        code: 'bienvenue20',
        discountBps: 2000,
        validFrom: '2026-06-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        firstTripOnly: true,
      },
      auth as never,
    );

    expect(prisma.promoCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'BIENVENUE20',
          discountBps: 2000,
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PROMO_CODE_CREATED' }),
      }),
    );
    expect(result.code).toBe('BIENVENUE20');
    expect(result.active).toBe(true);
  });

  it('normalise le code en majuscules', async () => {
    const { service, prisma } = createService();
    await service.createPromoCode(
      {
        code: 'test10',
        discountBps: 1000,
        validFrom: '2026-06-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
      },
      { user: { id: 'admin-1' } } as never,
    );

    expect(prisma.promoCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'TEST10' }),
      }),
    );
  });

  it('lance BadRequestException si validTo <= validFrom', async () => {
    const { service } = createService();
    await expect(
      service.createPromoCode(
        {
          code: 'BAD',
          discountBps: 1000,
          validFrom: '2026-12-31T00:00:00.000Z',
          validTo: '2026-06-01T00:00:00.000Z',
        },
        { user: { id: 'admin-1' } } as never,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejette les dates promo normalisees ou non ISO avant toute ecriture', async () => {
    const { service, prisma } = createService();

    await expect(
      service.createPromoCode(
        {
          code: 'BADDATE',
          discountBps: 1000,
          validFrom: '2026-02-31T00:00:00.000Z',
          validTo: '2026-12-31T23:59:59.000Z',
        },
        { user: { id: 'admin-1' } } as never,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.promoCode.findUnique).not.toHaveBeenCalled();
    expect(prisma.promoCode.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('lance ConflictException si le code existe deja', async () => {
    const { service, prisma } = createService();
    prisma.promoCode.findUnique.mockResolvedValue({ id: 'promo-existing' });

    await expect(
      service.createPromoCode(
        {
          code: 'BIENVENUE20',
          discountBps: 2000,
          validFrom: '2026-06-01T00:00:00.000Z',
          validTo: '2026-12-31T23:59:59.000Z',
        },
        { user: { id: 'admin-1' } } as never,
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe('AdminService.deactivatePromoCode', () => {
  it('desactive un code promo et cree un audit log', async () => {
    const { service, prisma, auth, baseCode } = createService();
    prisma.promoCode.findUnique.mockResolvedValue(baseCode());

    const result = await service.deactivatePromoCode('promo-1', auth as never);

    expect(prisma.promoCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PROMO_CODE_DEACTIVATED' }),
      }),
    );
    expect(result.active).toBe(false);
  });

  it('lance NotFoundException si le code promo est introuvable', async () => {
    const { service, auth } = createService();
    await expect(
      service.deactivatePromoCode('nonexistent', auth as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('lance BadRequestException si le code est deja inactif', async () => {
    const { service, prisma, auth, baseCode } = createService();
    prisma.promoCode.findUnique.mockResolvedValue({
      ...baseCode(),
      active: false,
    });

    await expect(
      service.deactivatePromoCode('promo-1', auth as never),
    ).rejects.toThrow(BadRequestException);
  });
});
