import { HealthService } from './health.service';

describe('HealthService', () => {
  function createService() {
    const prisma = {
      $queryRaw: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.rateLimitAdapter': 'in-memory',
          'infrastructure.rateLimit.strict': 'false',
          'infrastructure.realtimeAdapter': 'in-memory',
          'infrastructure.realtime.strict': 'false',
        };

        return values[key];
      }),
    };
    const rateLimitService = {
      snapshot: jest.fn().mockReturnValue({
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: false,
        degradeReason: null,
        trackedKeys: 3,
      }),
    };
    const realtimeService = {
      snapshot: jest.fn().mockReturnValue({
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: false,
        degradeReason: null,
        activeStreams: 2,
        publishedEvents: 7,
      }),
    };
    const appLifecycleService = {
      snapshot: jest.fn().mockReturnValue({
        state: 'ready',
        drainReason: null,
        lastTransitionAt: '2026-04-17T12:00:00.000Z',
      }),
      isReady: jest.fn().mockReturnValue(true),
      isLive: jest.fn().mockReturnValue(true),
    };
    const driverReservationExpiryService = {
      snapshot: jest.fn().mockReturnValue({
        enabled: true,
        intervalMs: 5000,
        inFlight: false,
        totalSweeps: 4,
        consecutiveFailures: 0,
        lastExpiredReservations: 1,
        lastStartedAt: '2026-04-17T11:59:58.000Z',
        lastCompletedAt: '2026-04-17T12:00:00.000Z',
        lastSucceededAt: new Date(Date.now()).toISOString(),
        lastFailedAt: null,
        lastFailureMessage: null,
        lastDurationMs: 45,
      }),
    };
    const healthIncidentJournalService = {
      list: jest.fn().mockReturnValue([]),
    };

    return {
      configService,
      prisma,
      rateLimitService,
      realtimeService,
      appLifecycleService,
      driverReservationExpiryService,
      healthIncidentJournalService,
      service: new HealthService(
        configService as never,
        prisma as never,
        rateLimitService as never,
        realtimeService as never,
        appLifecycleService as never,
        driverReservationExpiryService as never,
        healthIncidentJournalService as never,
      ),
    };
  }

  it('reports an ok health state when the database responds', async () => {
    const { prisma, service } = createService();

    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.dependencies.database).toBe('up');
    expect(result.dependencies.rateLimit).toBe('up');
    expect(result.dependencies.realtime).toBe('up');
    expect(result.dependencies.driverReservationExpiry).toBe('up');
    expect(result.lifecycle).toEqual({
      state: 'ready',
      drainReason: null,
      lastTransitionAt: '2026-04-17T12:00:00.000Z',
    });
    expect(result.infrastructure).toEqual({
      rateLimit: {
        configuredAdapter: 'in-memory',
        strict: 'false',
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: false,
        degradeReason: null,
        trackedKeys: 3,
      },
      realtime: {
        configuredAdapter: 'in-memory',
        adapter: 'in-memory',
        strict: 'false',
        sharedBackplane: false,
        degraded: false,
        degradeReason: null,
        activeStreams: 2,
        publishedEvents: 7,
      },
    });
    expect(result.operations.driverReservationExpiry).toEqual({
      enabled: true,
      intervalMs: 5000,
      inFlight: false,
      totalSweeps: 4,
      consecutiveFailures: 0,
      lastExpiredReservations: 1,
      lastStartedAt: '2026-04-17T11:59:58.000Z',
      lastCompletedAt: '2026-04-17T12:00:00.000Z',
      lastSucceededAt: expect.any(String),
      lastFailedAt: null,
      lastFailureMessage: null,
      lastDurationMs: 45,
    });
    expect(result.operations.healthHistory).toEqual([]);
  });

  it('reports a degraded health state when the database ping fails', async () => {
    const { prisma, service } = createService();

    prisma.$queryRaw.mockRejectedValue(new Error('db down'));

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.database).toBe('down');
  });

  it('reports readiness only when lifecycle and dependencies are healthy', async () => {
    const { prisma, service } = createService();

    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.ready();

    expect(result.status).toBe('ready');
  });

  it('reports degraded health when strict realtime mode detects a fallback adapter', async () => {
    const { configService, prisma, realtimeService, service } = createService();

    configService.get = jest.fn((key: string) => {
      const values: Record<string, string> = {
        'infrastructure.rateLimitAdapter': 'in-memory',
        'infrastructure.realtimeAdapter': 'redis',
        'infrastructure.realtime.strict': 'true',
      };

      return values[key];
    });

    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    realtimeService.snapshot.mockReturnValue({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: true,
      degradeReason: 'redis transport unavailable',
      activeStreams: 1,
      publishedEvents: 4,
    });

    const result = await service.ready();

    expect(result.status).toBe('not_ready');
  });

  it('reports degraded health when strict rate limit mode detects a fallback store', async () => {
    const { configService, prisma, rateLimitService, service } =
      createService();

    configService.get = jest.fn((key: string) => {
      const values: Record<string, string> = {
        'infrastructure.rateLimitAdapter': 'redis',
        'infrastructure.rateLimit.strict': 'true',
        'infrastructure.realtimeAdapter': 'in-memory',
        'infrastructure.realtime.strict': 'false',
      };

      return values[key];
    });

    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    rateLimitService.snapshot.mockReturnValue({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: true,
      degradeReason: 'redis rate limit store unavailable',
      trackedKeys: 2,
    });

    const result = await service.ready();

    expect(result.status).toBe('not_ready');
  });

  it('reports degraded health when the reservation expiry sweeper has consecutive failures', async () => {
    const { driverReservationExpiryService, prisma, service } = createService();

    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    driverReservationExpiryService.snapshot.mockReturnValue({
      enabled: true,
      intervalMs: 5000,
      inFlight: false,
      totalSweeps: 5,
      consecutiveFailures: 2,
      lastExpiredReservations: 0,
      lastStartedAt: '2026-04-17T11:59:58.000Z',
      lastCompletedAt: '2026-04-17T12:00:00.000Z',
      lastSucceededAt: '2026-04-17T11:55:00.000Z',
      lastFailedAt: '2026-04-17T12:00:00.000Z',
      lastFailureMessage: 'database timeout',
      lastDurationMs: 45,
    });

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.driverReservationExpiry).toBe('degraded');
  });

  it('reports degraded health when the reservation expiry sweeper is silent for too long', async () => {
    const { configService, driverReservationExpiryService, prisma, service } =
      createService();

    configService.get = jest.fn((key: string) => {
      const values: Record<string, string | number> = {
        'infrastructure.rateLimitAdapter': 'in-memory',
        'infrastructure.rateLimit.strict': 'false',
        'infrastructure.realtimeAdapter': 'in-memory',
        'infrastructure.realtime.strict': 'false',
        'operations.driverReservationExpiryMaxSilenceMs': 1000,
      };

      return values[key];
    });

    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    driverReservationExpiryService.snapshot.mockReturnValue({
      enabled: true,
      intervalMs: 5000,
      inFlight: false,
      totalSweeps: 4,
      consecutiveFailures: 0,
      lastExpiredReservations: 1,
      lastStartedAt: '2026-04-17T11:59:58.000Z',
      lastCompletedAt: '2026-04-17T12:00:00.000Z',
      lastSucceededAt: '2026-04-17T11:55:00.000Z',
      lastFailedAt: null,
      lastFailureMessage: null,
      lastDurationMs: 45,
    });

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.driverReservationExpiry).toBe('degraded');
  });
});
