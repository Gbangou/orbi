import { JobQueueWorkerService } from './job-queue-worker.service';

describe('JobQueueWorkerService', () => {
  const now = new Date('2026-05-15T08:00:00.000Z');

  function job(overrides: Record<string, unknown> = {}) {
    return {
      id: 'job-1',
      kind: 'NOTIFICATION',
      status: 'RUNNING',
      dedupeKey: 'notification:notification-1',
      entityType: 'notification',
      entityId: 'notification-1',
      payload: {
        notificationId: 'notification-1',
        userId: 'user-1',
        channel: 'PUSH',
      },
      attempts: 1,
      maxAttempts: 5,
      nextRunAt: now,
      lockedAt: now,
      completedAt: null,
      failedAt: null,
      lastError: null,
      deadLetterReason: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function createService() {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'app.environment': 'test',
          'operations.jobQueueWorkerBatchSize': 10,
          'operations.jobQueueWorkerRetryDelayMs': 30_000,
          'operations.jobQueueWorkerStaleAfterMs': 300_000,
        };

        return values[key];
      }),
    };
    const prisma = {
      paymentWebhookEvent: {
        findUnique: jest.fn(),
      },
      driverDocument: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      notification: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const jobQueueService = {
      claimDueJobs: jest.fn(),
      recoverStaleRunningJobs: jest.fn().mockResolvedValue([]),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    const notificationDeliveryService = {
      dispatch: jest.fn().mockResolvedValue({
        provider: 'local',
        providerMessageId: 'local:notification-1',
        deliveredAt: now,
      }),
    };
    const documentSafetyScannerService = {
      scan: jest.fn().mockResolvedValue({
        state: 'clear',
        engine: 'local-policy',
        scannedAt: now.toISOString(),
        findings: [],
        quarantineReason: null,
      }),
    };
    const documentObjectStorageService = {
      verifyStoredDocument: jest.fn().mockResolvedValue({
        state: 'confirmed',
        provider: 'local-provider',
        objectId: 'drivers/driver-1/permis.pdf',
        verifiedAt: now.toISOString(),
        sizeBytes: 120000,
        sha256:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        failureReason: null,
      }),
    };
    const driverReservationExpiryService = {
      runSweep: jest.fn().mockResolvedValue(undefined),
    };
    const paymentsService = {
      verifyPaymentAttemptWithProvider: jest.fn().mockResolvedValue({
        verified: true,
        paymentAttemptId: 'payment-1',
        provider: 'flutterwave',
        transactionRef: 'mobilis_123_ride-request-1',
        result: {
          nextAction: 'refund_processed',
        },
      }),
    };
    const moduleRef = {
      get: jest.fn((token: { name?: string }) =>
        token?.name === 'PaymentsService'
          ? paymentsService
          : driverReservationExpiryService,
      ),
    };

    return {
      configService,
      prisma,
      jobQueueService,
      notificationDeliveryService,
      documentSafetyScannerService,
      documentObjectStorageService,
      driverReservationExpiryService,
      paymentsService,
      moduleRef,
      service: new JobQueueWorkerService(
        configService as never,
        prisma as never,
        jobQueueService as never,
        notificationDeliveryService as never,
        documentSafetyScannerService as never,
        documentObjectStorageService as never,
        moduleRef as never,
      ),
    };
  }

  it('claims due notification jobs and marks them sent exactly once', async () => {
    const { jobQueueService, notificationDeliveryService, prisma, service } =
      createService();
    jobQueueService.claimDueJobs.mockResolvedValue([job()]);
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      sentAt: null,
    });
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    jobQueueService.complete.mockResolvedValue(job({ status: 'SUCCEEDED' }));

    const result = await service.processDueJobs({
      kinds: ['NOTIFICATION'],
      limit: 5,
    });

    expect(jobQueueService.claimDueJobs).toHaveBeenCalledWith({
      kinds: ['NOTIFICATION'],
      limit: 5,
    });
    expect(jobQueueService.recoverStaleRunningJobs).toHaveBeenCalledWith({
      kinds: ['NOTIFICATION'],
      limit: 5,
      olderThanMs: 300_000,
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'notification-1',
        sentAt: null,
      },
      data: {
        sentAt: now,
      },
    });
    expect(notificationDeliveryService.dispatch).toHaveBeenCalledWith({
      notificationId: 'notification-1',
      userId: 'user-1',
      channel: 'PUSH',
    });
    expect(jobQueueService.complete).toHaveBeenCalledWith('job-1', {
      lockedAt: now,
    });
    expect(jobQueueService.fail).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
    });
  });

  it('completes already-sent notification jobs without duplicate provider dispatch', async () => {
    const { jobQueueService, notificationDeliveryService, prisma, service } =
      createService();
    jobQueueService.claimDueJobs.mockResolvedValue([job()]);
    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      sentAt: now,
    });

    await service.processDueJobs();

    expect(prisma.notification.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'notification-1',
      },
      select: {
        id: true,
        sentAt: true,
      },
    });
    expect(notificationDeliveryService.dispatch).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    expect(jobQueueService.complete).toHaveBeenCalledWith('job-1', {
      lockedAt: now,
    });
  });

  it('fails malformed jobs into retry/dead-letter flow without leaking payloads', async () => {
    const { jobQueueService, service } = createService();
    jobQueueService.claimDueJobs.mockResolvedValue([
      job({
        payload: {
          userId: 'user-1',
        },
      }),
    ]);

    const result = await service.processDueJobs();

    expect(jobQueueService.fail).toHaveBeenCalledWith('job-1', {
      error: 'job_payload_notificationId_missing',
      retryDelayMs: 60_000,
      deadLetterReason:
        'notification_worker_failed:job_payload_notificationId_missing',
      lockedAt: now,
    });
    expect(result).toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
    });
  });

  it('validates payment webhook and driver document outbox references', async () => {
    const {
      documentObjectStorageService,
      documentSafetyScannerService,
      jobQueueService,
      prisma,
      service,
    } = createService();
    jobQueueService.claimDueJobs.mockResolvedValue([
      job({
        id: 'job-payment',
        kind: 'PAYMENT_WEBHOOK',
        payload: {
          eventId: 'webhook-event-1',
        },
      }),
      job({
        id: 'job-document',
        kind: 'DRIVER_DOCUMENT',
        payload: {
          documentId: 'document-1',
        },
      }),
    ]);
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
      id: 'webhook-event-1',
      action: 'persisted_and_reconciled',
      signatureVerified: true,
      paymentAttemptId: 'payment-1',
    });
    prisma.driverDocument.findUnique.mockResolvedValue({
      id: 'document-1',
      type: 'DRIVER_LICENSE',
      fileName: 'permis.pdf',
      storageKey: 'drivers/driver-1/permis.pdf',
      metadata: {
        integrity: {
          sizeBytes: 120000,
          sha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        objectVerification: {
          state: 'pending_provider_confirmation',
        },
      },
    });
    prisma.driverDocument.update.mockResolvedValue({
      id: 'document-1',
    });

    const result = await service.processDueJobs();

    expect(prisma.paymentWebhookEvent.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'webhook-event-1',
      },
      select: {
        id: true,
        action: true,
        signatureVerified: true,
        paymentAttemptId: true,
      },
    });
    expect(prisma.driverDocument.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
      },
      select: {
        id: true,
        type: true,
        fileName: true,
        storageKey: true,
        metadata: true,
      },
    });
    expect(documentSafetyScannerService.scan).toHaveBeenCalledWith({
      documentId: 'document-1',
      type: 'DRIVER_LICENSE',
      fileName: 'permis.pdf',
      storageKey: 'drivers/driver-1/permis.pdf',
      metadata: {
        integrity: {
          sizeBytes: 120000,
          sha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        objectVerification: {
          state: 'confirmed',
          provider: 'local-provider',
          objectId: 'drivers/driver-1/permis.pdf',
          verifiedAt: now.toISOString(),
          sizeBytes: 120000,
          sha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          failureReason: null,
        },
      },
    });
    expect(documentObjectStorageService.verifyStoredDocument).toHaveBeenCalledWith({
      storageKey: 'drivers/driver-1/permis.pdf',
      expectedSizeBytes: 120000,
      expectedSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(prisma.driverDocument.update).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
      },
      data: {
        metadata: {
          integrity: {
            sizeBytes: 120000,
            sha256:
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
          objectVerification: {
            state: 'confirmed',
            provider: 'local-provider',
            objectId: 'drivers/driver-1/permis.pdf',
            verifiedAt: now.toISOString(),
            sizeBytes: 120000,
            sha256:
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            failureReason: null,
          },
          safetyScan: {
            state: 'clear',
            engine: 'local-policy',
            scannedAt: now.toISOString(),
            findings: [],
            quarantineReason: null,
          },
        },
      },
    });
    expect(jobQueueService.complete).toHaveBeenCalledWith('job-payment', {
      lockedAt: now,
    });
    expect(jobQueueService.complete).toHaveBeenCalledWith('job-document', {
      lockedAt: now,
    });
    expect(result).toEqual({
      claimed: 2,
      completed: 2,
      failed: 0,
    });
  });

  it('runs reservation expiry jobs through the shared worker', async () => {
    const { driverReservationExpiryService, jobQueueService, moduleRef, service } =
      createService();
    jobQueueService.claimDueJobs.mockResolvedValue([
      job({
        id: 'job-reservation-expiry',
        kind: 'DRIVER_RESERVATION_EXPIRY',
        dedupeKey: 'driver-reservation-expiry:sweep',
        entityType: 'driver_reservation_expiry',
        entityId: 'sweep',
        payload: {
          requestedAt: now.toISOString(),
        },
      }),
    ]);

    const result = await service.processDueJobs({
      kinds: ['DRIVER_RESERVATION_EXPIRY'],
      limit: 1,
    });

    expect(moduleRef.get).toHaveBeenCalledWith(expect.any(Function), {
      strict: false,
    });
    expect(driverReservationExpiryService.runSweep).toHaveBeenCalledTimes(1);
    expect(jobQueueService.complete).toHaveBeenCalledWith(
      'job-reservation-expiry',
      {
        lockedAt: now,
      },
    );
    expect(result).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
    });
  });

  it('verifies pending provider refund jobs through the payments service', async () => {
    const { jobQueueService, moduleRef, paymentsService, service } =
      createService();
    jobQueueService.claimDueJobs.mockResolvedValue([
      job({
        id: 'job-refund',
        kind: 'PAYMENT_REFUND_VERIFICATION',
        dedupeKey: 'payment-refund-verification:payment-1',
        entityType: 'payment_attempt',
        entityId: 'payment-1',
        payload: {
          paymentAttemptId: 'payment-1',
          providerRefundReference: 'fw_refund_123',
        },
      }),
    ]);

    const result = await service.processDueJobs({
      kinds: ['PAYMENT_REFUND_VERIFICATION'],
      limit: 1,
    });

    expect(moduleRef.get).toHaveBeenCalledWith(expect.any(Function), {
      strict: false,
    });
    expect(paymentsService.verifyPaymentAttemptWithProvider).toHaveBeenCalledWith(
      'payment-1',
    );
    expect(jobQueueService.complete).toHaveBeenCalledWith('job-refund', {
      lockedAt: now,
    });
    expect(result).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
    });
  });

  it('retries pending provider refund verification until the provider finishes', async () => {
    const { jobQueueService, paymentsService, service } = createService();
    paymentsService.verifyPaymentAttemptWithProvider.mockResolvedValueOnce({
      verified: true,
      paymentAttemptId: 'payment-1',
      provider: 'flutterwave',
      transactionRef: 'mobilis_123_ride-request-1',
      result: {
        nextAction: 'refund_still_pending',
      },
    });
    jobQueueService.claimDueJobs.mockResolvedValue([
      job({
        id: 'job-refund',
        kind: 'PAYMENT_REFUND_VERIFICATION',
        payload: {
          paymentAttemptId: 'payment-1',
        },
      }),
    ]);

    const result = await service.processDueJobs();

    expect(jobQueueService.fail).toHaveBeenCalledWith('job-refund', {
      error: 'payment_refund_still_pending',
      retryDelayMs: 60_000,
      deadLetterReason:
        'payment_refund_verification_worker_failed:payment_refund_still_pending',
      lockedAt: now,
    });
    expect(result).toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
    });
  });
});
