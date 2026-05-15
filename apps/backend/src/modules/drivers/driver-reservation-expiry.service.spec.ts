import { DriverReservationExpiryService } from './driver-reservation-expiry.service';

describe('DriverReservationExpiryService', () => {
  function createService(overrides?: {
    intervalMs?: number;
    isReady?: boolean;
    expireCount?: number;
  }) {
    const configService = {
      get: jest.fn().mockReturnValue(overrides?.intervalMs ?? 5000),
    };
    const appLifecycleService = {
      isReady: jest.fn().mockReturnValue(overrides?.isReady ?? true),
    };
    const dispatchCoordinator = {
      expireStaleReservations: jest
        .fn()
        .mockResolvedValue(overrides?.expireCount ?? 0),
    };
    const jobQueueService = {
      enqueue: jest.fn().mockResolvedValue({
        id: 'job-reservation-expiry',
        kind: 'DRIVER_RESERVATION_EXPIRY',
      }),
    };

    return {
      configService,
      appLifecycleService,
      dispatchCoordinator,
      jobQueueService,
      service: new DriverReservationExpiryService(
        configService as never,
        appLifecycleService as never,
        dispatchCoordinator as never,
        jobQueueService as never,
      ),
    };
  }

  it('runs a sweep when the app is ready', async () => {
    const { dispatchCoordinator, service } = createService({ expireCount: 2 });

    await service.runSweep();

    expect(dispatchCoordinator.expireStaleReservations).toHaveBeenCalledTimes(
      1,
    );
  });

  it('skips sweeps while the app is not ready', async () => {
    const { dispatchCoordinator, service } = createService({ isReady: false });

    await service.runSweep();

    expect(dispatchCoordinator.expireStaleReservations).not.toHaveBeenCalled();
  });

  it('enqueues a durable reservation expiry job when the app is ready', async () => {
    const { jobQueueService, service } = createService();

    await service.enqueueSweep();

    expect(jobQueueService.enqueue).toHaveBeenCalledWith({
      kind: 'DRIVER_RESERVATION_EXPIRY',
      dedupeKey: 'driver-reservation-expiry:sweep',
      entityType: 'driver_reservation_expiry',
      entityId: 'sweep',
      payload: {
        requestedAt: expect.any(String),
      },
      maxAttempts: 3,
      resetSucceededOnDedupe: true,
    });
  });

  it('does not enqueue durable sweeps while the app is not ready', async () => {
    const { jobQueueService, service } = createService({ isReady: false });

    await service.enqueueSweep();

    expect(jobQueueService.enqueue).not.toHaveBeenCalled();
  });

  it('does not start an interval in test environment', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const { service } = createService();

    service.onModuleInit();

    expect(setIntervalSpy).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('does not start the sweeper when the interval is not positive', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { service } = createService({ intervalMs: 0 });

    service.onModuleInit();

    expect(setIntervalSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    setIntervalSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('clears the active interval on module destroy', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const intervalHandle = {
      unref: jest.fn(),
    } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue(intervalHandle);
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { jobQueueService, service } = createService();

    service.onModuleInit();
    service.onModuleDestroy();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalHandle);
    expect(jobQueueService.enqueue).not.toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
    setIntervalSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('skips duplicate initialization when the sweeper is already running', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const intervalHandle = {
      unref: jest.fn(),
    } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue(intervalHandle);
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { service } = createService();

    service.onModuleInit();
    service.onModuleInit();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    setIntervalSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('prevents overlapping sweeps when a previous run is still in flight', async () => {
    let resolveSweep: ((value: number) => void) | null = null;
    const { dispatchCoordinator, service } = createService();

    dispatchCoordinator.expireStaleReservations.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveSweep = resolve;
      }),
    );

    const firstRun = service.runSweep();
    const secondRun = service.runSweep();

    expect(dispatchCoordinator.expireStaleReservations).toHaveBeenCalledTimes(
      1,
    );

    resolveSweep?.(1);
    await Promise.all([firstRun, secondRun]);

    await service.runSweep();

    expect(dispatchCoordinator.expireStaleReservations).toHaveBeenCalledTimes(
      2,
    );
  });

  it('recovers after a failed sweep and allows later retries', async () => {
    const { dispatchCoordinator, service } = createService();

    dispatchCoordinator.expireStaleReservations
      .mockRejectedValueOnce(new Error('database timeout'))
      .mockResolvedValueOnce(1);

    await expect(service.runSweep()).resolves.toBeUndefined();
    await expect(service.runSweep()).resolves.toBeUndefined();

    expect(dispatchCoordinator.expireStaleReservations).toHaveBeenCalledTimes(
      2,
    );
  });

  it('exposes an operational snapshot after successful and failed sweeps', async () => {
    const { dispatchCoordinator, service } = createService();

    dispatchCoordinator.expireStaleReservations
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('database timeout'));

    await service.runSweep();

    expect(service.snapshot()).toEqual({
      enabled: true,
      intervalMs: 5000,
      inFlight: false,
      totalSweeps: 1,
      consecutiveFailures: 0,
      lastExpiredReservations: 2,
      lastStartedAt: expect.any(String),
      lastCompletedAt: expect.any(String),
      lastSucceededAt: expect.any(String),
      lastFailedAt: null,
      lastFailureMessage: null,
      lastDurationMs: expect.any(Number),
    });

    await service.runSweep();

    expect(service.snapshot()).toEqual({
      enabled: true,
      intervalMs: 5000,
      inFlight: false,
      totalSweeps: 2,
      consecutiveFailures: 1,
      lastExpiredReservations: 2,
      lastStartedAt: expect.any(String),
      lastCompletedAt: expect.any(String),
      lastSucceededAt: expect.any(String),
      lastFailedAt: expect.any(String),
      lastFailureMessage: 'database timeout',
      lastDurationMs: expect.any(Number),
    });
  });
});
