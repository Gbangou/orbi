import { AdminService } from './admin.service';

function createTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1',
    status: 'COMPLETED',
    pickupAddress: 'Universite Joseph Ki-Zerbo',
    destinationAddress: 'Ouaga 2000',
    actualFare: 1800,
    distanceKm: 6.4,
    durationMinutes: 18,
    currency: 'XOF',
    startedAt: new Date('2026-05-01T09:00:00.000Z'),
    completedAt: new Date('2026-05-01T09:18:00.000Z'),
    createdAt: new Date('2026-05-01T08:55:00.000Z'),
    updatedAt: new Date('2026-05-01T09:18:00.000Z'),
    rider: { user: { fullName: 'Awa Rider' } },
    driver: { user: { fullName: 'Issa Driver' } },
    vehicle: {
      make: 'Yamaha',
      model: 'Crypton',
      type: 'MOTORCYCLE',
      plateNumber: '12BF345',
    },
    rideRequest: {
      paymentMethod: 'MOBILE_MONEY',
      estimatedFare: 1800,
      paymentAttempts: [{ status: 'SUCCEEDED', createdAt: new Date() }],
    },
    events: [
      {
        id: 'event-1',
        eventType: 'ROUTE_POSITION_RECORDED',
        payload: { sourceRole: 'DRIVER' },
        createdAt: new Date(),
      },
    ],
    ...overrides,
  };
}

function createService(trips = [createTrip()]) {
  const prisma = {
    trip: {
      findMany: jest.fn().mockResolvedValue(trips),
      findUnique: jest.fn().mockResolvedValue(trips[0] ?? null),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
    },
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

  return { prisma, service };
}

describe('AdminService.tripsAudit', () => {
  it('calcule completion, reconciliation mobile money et files owner', async () => {
    const { service } = createService();

    const audit = await service.tripsAudit({ lookbackHours: 24 });

    expect(audit.summary.totalTrips).toBe(1);
    expect(audit.summary.completedTrips).toBe(1);
    expect(audit.summary.completionRate).toBe(100);
    expect(audit.summary.mobileMoneyReconciliationRate).toBe(100);
    expect(audit.ownerQueue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: 'finance', count: 0 }),
      ]),
    );
  });

  it('remonte un risque critique finance quand une course MM terminee sans paiement reussi', async () => {
    const { service } = createService([
      createTrip({
        rideRequest: {
          paymentMethod: 'MOBILE_MONEY',
          estimatedFare: 2200,
          paymentAttempts: [{ status: 'FAILED', createdAt: new Date() }],
        },
      }),
    ]);

    const audit = await service.tripsAudit();

    expect(audit.summary.criticalRiskTripCount).toBe(1);
    expect(audit.summary.moneyAtRisk).toBe(1800);
    expect(audit.riskTrips[0]).toEqual(
      expect.objectContaining({
        owner: 'finance',
        severity: 'critical',
        paymentStatus: 'FAILED',
      }),
    );
  });

  it('exclut les risques deja resolus avec la meme empreinte de raisons', async () => {
    const { prisma, service } = createService([
      createTrip({
        rideRequest: {
          paymentMethod: 'MOBILE_MONEY',
          estimatedFare: 2200,
          paymentAttempts: [{ status: 'FAILED', createdAt: new Date() }],
        },
      }),
    ]);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        entityId: 'trip-1',
        metadata: {
          riskReasons: [
            'Course terminee sans paiement mobile money reussi.',
          ],
        },
      },
    ]);

    const audit = await service.tripsAudit();

    expect(audit.summary.riskTripCount).toBe(0);
    expect(audit.summary.resolvedRiskTripCount).toBe(1);
    expect(audit.riskTrips).toEqual([]);
  });

  it('ecrit un audit log quand un ops resout un risque trajet actif', async () => {
    const { prisma, service } = createService([
      createTrip({
        rideRequest: {
          paymentMethod: 'MOBILE_MONEY',
          estimatedFare: 2200,
          paymentAttempts: [{ status: 'FAILED', createdAt: new Date() }],
        },
      }),
    ]);

    const response = await service.resolveTripAuditRisk(
      'trip-1',
      { reason: 'Paiement rapproche avec le journal provider terrain.' },
      { user: { id: 'ops-1' } } as never,
    );

    expect(response).toEqual(
      expect.objectContaining({
        tripId: 'trip-1',
        status: 'RESOLVED',
        owner: 'finance',
        severity: 'critical',
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'ops-1',
          action: 'TRIP_AUDIT_RISK_RESOLVED',
          entityType: 'TRIP',
          entityId: 'trip-1',
          metadata: expect.objectContaining({
            reason: 'Paiement rapproche avec le journal provider terrain.',
            riskReasons: [
              'Course terminee sans paiement mobile money reussi.',
            ],
          }),
        }),
      }),
    );
  });

  it('borne la fenetre d audit entre 1h et 168h', async () => {
    const { prisma, service } = createService();

    await service.tripsAudit({ lookbackHours: 999 });

    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 300,
        where: expect.objectContaining({
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });
});
