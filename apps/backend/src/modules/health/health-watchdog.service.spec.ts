import { HealthWatchdogService } from './health-watchdog.service';

describe('HealthWatchdogService', () => {
  function createService() {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, number> = {
          'operations.healthWatchdogIntervalMs': 15000,
          'operations.healthWatchdogAlertCooldownMs': 60000,
        };

        return values[key];
      }),
    };
    const healthService = {
      check: jest.fn(),
    };
    const realtimeService = {
      publish: jest.fn(),
    };
    const appLifecycleService = {
      isLive: jest.fn().mockReturnValue(true),
    };
    const healthIncidentJournalService = {
      record: jest.fn(),
    };

    return {
      configService,
      healthService,
      realtimeService,
      appLifecycleService,
      healthIncidentJournalService,
      service: new HealthWatchdogService(
        configService as never,
        healthService as never,
        realtimeService as never,
        appLifecycleService as never,
        healthIncidentJournalService as never,
      ),
    };
  }

  function degradedSnapshot() {
    return {
      status: 'degraded' as const,
      service: 'mobilis-backend',
      timestamp: '2026-04-19T03:00:00.000Z',
      uptimeSeconds: 120,
      runtime: {
        nodeVersion: 'v22.0.0',
        pid: 123,
        memory: {
          rss: 1,
          heapUsed: 1,
          heapTotal: 1,
        },
      },
      dependencies: {
        database: 'up',
        rateLimit: 'up',
        realtime: 'degraded',
        driverReservationExpiry: 'degraded',
      },
      lifecycle: {
        state: 'ready',
        drainReason: null,
        lastTransitionAt: '2026-04-19T02:59:00.000Z',
      },
      infrastructure: {
        rateLimit: {
          configuredAdapter: 'in-memory',
          strict: false,
          adapter: 'in-memory',
          sharedBackplane: false,
          degraded: false,
          degradeReason: null,
          trackedKeys: 1,
        },
        realtime: {
          configuredAdapter: 'redis',
          strict: true,
          adapter: 'in-memory',
          sharedBackplane: false,
          degraded: true,
          degradeReason: 'redis unavailable',
          activeStreams: 1,
          publishedEvents: 4,
          featureFlagMode: 'on',
          featureFlagEnabled: true,
        },
      },
      operations: {
        driverReservationExpiry: {
          enabled: true,
          intervalMs: 5000,
          inFlight: false,
          totalSweeps: 5,
          consecutiveFailures: 2,
          lastExpiredReservations: 0,
          lastStartedAt: '2026-04-19T02:58:58.000Z',
          lastCompletedAt: '2026-04-19T02:59:00.000Z',
          lastSucceededAt: '2026-04-19T02:50:00.000Z',
          lastFailedAt: '2026-04-19T02:59:00.000Z',
          lastFailureMessage: 'database timeout',
          lastDurationMs: 50,
        },
      },
    };
  }

  function healthySnapshot() {
    return {
      ...degradedSnapshot(),
      status: 'ok' as const,
      dependencies: {
        database: 'up',
        rateLimit: 'up',
        realtime: 'up',
        driverReservationExpiry: 'up',
      },
      infrastructure: {
        ...degradedSnapshot().infrastructure,
        realtime: {
          ...degradedSnapshot().infrastructure.realtime,
          configuredAdapter: 'in-memory',
          strict: false,
          degraded: false,
          degradeReason: null,
        },
      },
      operations: {
        driverReservationExpiry: {
          ...degradedSnapshot().operations.driverReservationExpiry,
          consecutiveFailures: 0,
          lastFailureMessage: null,
        },
      },
    };
  }

  it('publishes an admin health alert when the backend becomes degraded', async () => {
    const {
      healthIncidentJournalService,
      healthService,
      realtimeService,
      service,
    } = createService();

    healthService.check.mockResolvedValue(degradedSnapshot());

    await service.runCheck();

    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'admin',
        type: 'system.health-alert',
        entityId: 'mobilis-backend',
        actorRole: 'SYSTEM',
      }),
    );
    expect(healthIncidentJournalService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'alert',
        status: 'degraded',
        title: 'Alerte systeme publiee',
      }),
    );
  });

  it('does not spam identical alerts inside the cooldown window', async () => {
    const { healthService, realtimeService, service } = createService();

    healthService.check.mockResolvedValue(degradedSnapshot());

    await service.runCheck();
    await service.runCheck();

    expect(realtimeService.publish).toHaveBeenCalledTimes(1);
  });

  it('publishes a recovery event when the backend returns to healthy', async () => {
    const {
      healthIncidentJournalService,
      healthService,
      realtimeService,
      service,
    } = createService();

    healthService.check
      .mockResolvedValueOnce(degradedSnapshot())
      .mockResolvedValueOnce(healthySnapshot());

    await service.runCheck();
    await service.runCheck();

    expect(realtimeService.publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        channel: 'admin',
        type: 'system.health-recovered',
        entityId: 'mobilis-backend',
        actorRole: 'SYSTEM',
      }),
    );
    expect(healthIncidentJournalService.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tone: 'recovered',
        status: 'ok',
        title: 'Sante systeme retablie',
      }),
    );
  });

  it('skips checks while the application is not live', async () => {
    const { appLifecycleService, healthService, realtimeService, service } =
      createService();

    appLifecycleService.isLive.mockReturnValue(false);

    await service.runCheck();

    expect(healthService.check).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
  });
});
