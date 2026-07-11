import { PaymentAttemptReconciliationSweepService } from './payment-attempt-reconciliation-sweep.service';

describe('PaymentAttemptReconciliationSweepService', () => {
  function createService(overrides?: {
    intervalMs?: number;
    isReady?: boolean;
    staleAttempts?: Array<{ id: string }>;
  }) {
    const configService = {
      get: jest.fn().mockReturnValue(overrides?.intervalMs ?? 120000),
    };
    const appLifecycleService = {
      isReady: jest.fn().mockReturnValue(overrides?.isReady ?? true),
    };
    const prisma = {
      paymentAttempt: {
        findMany: jest
          .fn()
          .mockResolvedValue(overrides?.staleAttempts ?? []),
      },
    };
    const jobQueueService = {
      enqueue: jest.fn().mockResolvedValue({
        id: 'job-payment-reconciliation',
        kind: 'PAYMENT_ATTEMPT_RECONCILIATION_SWEEP',
      }),
    };
    const paymentsService = {
      verifyPaymentAttemptWithProvider: jest.fn().mockResolvedValue({
        verified: true,
      }),
    };

    return {
      configService,
      appLifecycleService,
      prisma,
      jobQueueService,
      paymentsService,
      service: new PaymentAttemptReconciliationSweepService(
        configService as never,
        appLifecycleService as never,
        prisma as never,
        jobQueueService as never,
        paymentsService as never,
      ),
    };
  }

  it('checks every stale payment attempt against its provider', async () => {
    const { prisma, paymentsService, service } = createService({
      staleAttempts: [{ id: 'attempt-1' }, { id: 'attempt-2' }],
    });

    await service.runSweep();

    expect(prisma.paymentAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['INITIATED', 'PENDING'] },
        }),
      }),
    );
    expect(
      paymentsService.verifyPaymentAttemptWithProvider,
    ).toHaveBeenCalledTimes(2);
    expect(
      paymentsService.verifyPaymentAttemptWithProvider,
    ).toHaveBeenCalledWith('attempt-1');
    expect(
      paymentsService.verifyPaymentAttemptWithProvider,
    ).toHaveBeenCalledWith('attempt-2');
  });

  it('keeps checking remaining attempts when one verification throws', async () => {
    const { paymentsService, service } = createService({
      staleAttempts: [{ id: 'attempt-1' }, { id: 'attempt-2' }],
    });

    paymentsService.verifyPaymentAttemptWithProvider
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ verified: true });

    await service.runSweep();

    expect(
      paymentsService.verifyPaymentAttemptWithProvider,
    ).toHaveBeenCalledTimes(2);
    expect(service.snapshot()).toEqual(
      expect.objectContaining({
        lastCheckedCount: 2,
        lastReconciledCount: 1,
        lastReconciliationErrorCount: 1,
      }),
    );
  });

  it('skips sweeps while the app is not ready', async () => {
    const { prisma, service } = createService({ isReady: false });

    await service.runSweep();

    expect(prisma.paymentAttempt.findMany).not.toHaveBeenCalled();
  });

  it('enqueues a durable reconciliation sweep job when the app is ready', async () => {
    const { jobQueueService, service } = createService();

    await service.enqueueSweep();

    expect(jobQueueService.enqueue).toHaveBeenCalledWith({
      kind: 'PAYMENT_ATTEMPT_RECONCILIATION_SWEEP',
      dedupeKey: 'payment-attempt-reconciliation:sweep',
      entityType: 'payment_attempt_reconciliation',
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

  it('clears the active interval on module destroy', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const intervalHandle = { unref: jest.fn() } as unknown as NodeJS.Timeout;
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

  it('prevents overlapping sweeps when a previous run is still in flight', async () => {
    let resolveFindMany!: (value: Array<{ id: string }>) => void;
    const { prisma, service } = createService();

    prisma.paymentAttempt.findMany.mockReturnValue(
      new Promise((resolve) => {
        resolveFindMany = resolve;
      }),
    );

    const firstRun = service.runSweep();
    const secondRun = service.runSweep();

    expect(prisma.paymentAttempt.findMany).toHaveBeenCalledTimes(1);

    resolveFindMany([]);
    await Promise.all([firstRun, secondRun]);

    await service.runSweep();

    expect(prisma.paymentAttempt.findMany).toHaveBeenCalledTimes(2);
  });

  it('recovers after a failed sweep and allows later retries', async () => {
    const { prisma, service } = createService();

    prisma.paymentAttempt.findMany
      .mockRejectedValueOnce(new Error('database timeout'))
      .mockResolvedValueOnce([]);

    await expect(service.runSweep()).resolves.toBeUndefined();
    await expect(service.runSweep()).resolves.toBeUndefined();

    expect(prisma.paymentAttempt.findMany).toHaveBeenCalledTimes(2);
    expect(service.snapshot()).toEqual(
      expect.objectContaining({
        totalSweeps: 2,
        consecutiveFailures: 0,
        lastFailureMessage: null,
      }),
    );
  });

  it('exposes an operational snapshot after successful and failed sweeps', async () => {
    const { prisma, service } = createService();

    prisma.paymentAttempt.findMany
      .mockResolvedValueOnce([{ id: 'attempt-1' }])
      .mockRejectedValueOnce(new Error('database timeout'));

    await service.runSweep();

    expect(service.snapshot()).toEqual({
      enabled: true,
      intervalMs: 120000,
      staleAfterMs: 120000,
      batchSize: 120000,
      inFlight: false,
      totalSweeps: 1,
      consecutiveFailures: 0,
      lastCheckedCount: 1,
      lastReconciledCount: 1,
      lastReconciliationErrorCount: 0,
      lastStartedAt: expect.any(String),
      lastCompletedAt: expect.any(String),
      lastSucceededAt: expect.any(String),
      lastFailedAt: null,
      lastFailureMessage: null,
      lastDurationMs: expect.any(Number),
    });

    await service.runSweep();

    expect(service.snapshot()).toEqual(
      expect.objectContaining({
        totalSweeps: 2,
        consecutiveFailures: 1,
        lastFailureMessage: 'database timeout',
      }),
    );
  });
});
