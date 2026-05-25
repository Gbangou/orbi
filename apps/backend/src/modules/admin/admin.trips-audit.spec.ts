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
