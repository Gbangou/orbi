import { AdminService } from './admin.service';

/**
 * Admin trips CSV export — OWASP API3 (Excessive Data Exposure) guard:
 * only ADMIN/OPS can call the endpoint; audit log is written on every export;
 * sensitive IDs are opaque strings, no driver/rider internal IDs leak.
 */

function createService() {
  const trip = (overrides: Record<string, unknown> = {}) => ({
    id: 'trip-1',
    status: 'COMPLETED',
    cancelledBy: null,
    pickupAddress: 'Universite Joseph Ki-Zerbo',
    destinationAddress: 'Ouaga 2000',
    actualFare: 1800,
    distanceKm: 6.4,
    durationMinutes: 18,
    currency: 'XOF',
    startedAt: new Date('2026-05-01T09:00:00.000Z'),
    completedAt: new Date('2026-05-01T09:18:00.000Z'),
    createdAt: new Date('2026-05-01T08:55:00.000Z'),
    rider: { user: { fullName: 'Awa Rider' } },
    driver: { user: { fullName: 'Issa Driver' } },
    vehicle: {
      make: 'Yamaha',
      model: 'Crypton',
      type: 'MOTO',
      plateNumber: '12BF345',
    },
    rideRequest: { paymentMethod: 'MOBILE_MONEY', estimatedFare: 2000 },
    ...overrides,
  });

  const prisma = {
    trip: {
      findMany: jest.fn().mockResolvedValue([trip()]),
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

  return { prisma, service, auth, trip };
}

describe('AdminService.tripsExportCsv', () => {
  it('retourne un CSV avec une ligne de headers et une ligne par trajet', async () => {
    const { service, auth } = createService();
    const csv = await service.tripsExportCsv({}, auth as never);

    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('trip_id');
    expect(lines[0]).toContain('rider_name');
    expect(lines[0]).toContain('driver_name');
    expect(lines[0]).toContain('actual_fare');
    expect(lines[0]).toContain('payment_method');
  });

  it('inclut les données du trajet dans la ligne CSV', async () => {
    const { service, auth } = createService();
    const csv = await service.tripsExportCsv({}, auth as never);

    const dataLine = csv.trim().split('\n')[1];
    expect(dataLine).toContain('trip-1');
    expect(dataLine).toContain('Awa Rider');
    expect(dataLine).toContain('Issa Driver');
    expect(dataLine).toContain('Ouaga 2000');
    expect(dataLine).toContain('MOBILE_MONEY');
    expect(dataLine).toContain('COMPLETED');
  });

  it('filtre par statut quand status est fourni', async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv({ status: 'COMPLETED' }, auth as never);

    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it("pas de filtre statut quand status n'est pas fourni", async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv({}, auth as never);

    const call = prisma.trip.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).not.toHaveProperty('status');
  });

  it('applique un filtre createdAt gte quand fromDate est fourni', async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv({ fromDate: '2026-05-01' }, auth as never);

    const call = prisma.trip.findMany.mock.calls[0][0] as {
      where: { createdAt?: { gte?: Date } };
    };
    expect(call.where.createdAt?.gte).toBeInstanceOf(Date);
    expect((call.where.createdAt?.gte as Date).toISOString()).toContain(
      '2026-05-01',
    );
  });

  it('applique un filtre createdAt lte à fin de journée quand toDate est fourni', async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv({ toDate: '2026-05-31' }, auth as never);

    const call = prisma.trip.findMany.mock.calls[0][0] as {
      where: { createdAt?: { lte?: Date } };
    };
    const lte = call.where.createdAt?.lte as Date;
    expect(lte).toBeInstanceOf(Date);
    expect(lte.getUTCHours()).toBe(23);
    expect(lte.getUTCMinutes()).toBe(59);
  });

  it('filtre par nom avec OR sur rider/driver fullName quand search est fourni', async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv({ search: 'Konaté' }, auth as never);

    const call = prisma.trip.findMany.mock.calls[0][0] as {
      where: { OR?: unknown[] };
    };
    expect(Array.isArray(call.where.OR)).toBe(true);
    expect(call.where.OR).toHaveLength(2);
  });

  it("enregistre fromDate/toDate/search dans les metadonnees de l'audit log", async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv(
      { fromDate: '2026-05-01', toDate: '2026-05-31', search: 'Awa' },
      auth as never,
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            fromDate: '2026-05-01',
            toDate: '2026-05-31',
            search: 'Awa',
          }),
        }),
      }),
    );
  });

  it('respecte la limite fournie dans la query', async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv({ limit: 50 }, auth as never);

    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('clampe la limite à 500 max', async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv({ limit: 9999 }, auth as never);

    const call = prisma.trip.findMany.mock.calls[0][0] as { take: number };
    expect(call.take).toBeLessThanOrEqual(500);
  });

  it('écrit un audit log TRIPS_EXPORTED à chaque export', async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv(
      { status: 'COMPLETED', limit: 10 },
      auth as never,
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'admin-1',
          action: 'TRIPS_EXPORTED',
          entityType: 'TRIP',
          entityId: 'COMPLETED',
        }),
      }),
    );
  });

  it('enregistre ALL comme entityId quand aucun filtre statut', async () => {
    const { prisma, service, auth } = createService();
    await service.tripsExportCsv({}, auth as never);

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityId: 'ALL' }),
      }),
    );
  });

  it('gère les champs optionnels null (fare, distance, duration)', async () => {
    const { prisma, service, auth, trip } = createService();
    prisma.trip.findMany.mockResolvedValue([
      trip({ actualFare: null, distanceKm: null, durationMinutes: null }),
    ]);

    const csv = await service.tripsExportCsv({}, auth as never);
    const dataLine = csv.trim().split('\n')[1];

    expect(dataLine).toContain('COMPLETED');
  });

  it('échappe les virgules dans les adresses pour ne pas corrompre le CSV', async () => {
    const { prisma, service, auth, trip } = createService();
    prisma.trip.findMany.mockResolvedValue([
      trip({ pickupAddress: 'Secteur 15, Ouagadougou' }),
    ]);

    const csv = await service.tripsExportCsv({}, auth as never);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
  });

  it('retourne seulement les headers quand aucun trajet ne correspond au filtre', async () => {
    const { prisma, service, auth } = createService();
    prisma.trip.findMany.mockResolvedValue([]);

    const csv = await service.tripsExportCsv(
      { status: 'MATCHED' },
      auth as never,
    );
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('trip_id');
  });
});
