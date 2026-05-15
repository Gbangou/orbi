import { BadRequestException } from '@nestjs/common';
import { JobQueueService } from './job-queue.service';

describe('JobQueueService', () => {
  const now = new Date('2026-05-08T10:00:00.000Z');

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'job-1',
      kind: 'PAYMENT_WEBHOOK',
      status: 'PENDING',
      dedupe_key: 'payment-webhook:event-1',
      entity_type: 'payment_webhook_event',
      entity_id: 'event-1',
      payload: { eventId: 'event-1' },
      attempts: 0,
      max_attempts: 5,
      next_run_at: now,
      locked_at: null,
      completed_at: null,
      failed_at: null,
      last_error: null,
      dead_letter_reason: null,
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      $queryRaw: jest.fn(),
    };

    return {
      prisma,
      service: new JobQueueService(prisma as never),
    };
  }

  it('enqueues durable webhook jobs with a dedupe key', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw.mockResolvedValue([row()]);

    const result = await service.enqueue({
      kind: 'PAYMENT_WEBHOOK',
      dedupeKey: 'payment-webhook:event-1',
      entityType: 'payment_webhook_event',
      entityId: 'event-1',
      payload: { eventId: 'event-1' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'job-1',
        kind: 'PAYMENT_WEBHOOK',
        status: 'PENDING',
        dedupeKey: 'payment-webhook:event-1',
      }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('accepts recurring reservation expiry jobs that reset succeeded dedupe entries', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw.mockResolvedValue([
      row({
        kind: 'DRIVER_RESERVATION_EXPIRY',
        dedupe_key: 'driver-reservation-expiry:sweep',
        entity_type: 'driver_reservation_expiry',
        entity_id: 'sweep',
        payload: {
          requestedAt: now.toISOString(),
        },
      }),
    ]);

    const result = await service.enqueue({
      kind: 'DRIVER_RESERVATION_EXPIRY',
      dedupeKey: 'driver-reservation-expiry:sweep',
      entityType: 'driver_reservation_expiry',
      entityId: 'sweep',
      payload: {
        requestedAt: now.toISOString(),
      },
      maxAttempts: 3,
      resetSucceededOnDedupe: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'DRIVER_RESERVATION_EXPIRY',
        status: 'PENDING',
        dedupeKey: 'driver-reservation-expiry:sweep',
      }),
    );
  });

  it('claims due document and notification jobs in bounded batches', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw.mockResolvedValue([
      row({
        id: 'job-2',
        kind: 'DRIVER_DOCUMENT',
        status: 'RUNNING',
        attempts: 1,
      }),
    ]);

    const result = await service.claimDueJobs({
      kinds: ['DRIVER_DOCUMENT', 'NOTIFICATION'],
      limit: 25,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'job-2',
        kind: 'DRIVER_DOCUMENT',
        status: 'RUNNING',
        attempts: 1,
      }),
    );
  });

  it('moves exhausted jobs to dead-letter with the final error', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw.mockResolvedValue([
      row({
        status: 'DEAD_LETTER',
        attempts: 5,
        failed_at: now,
        last_error: 'provider timeout',
        dead_letter_reason: 'provider timeout',
      }),
    ]);

    const result = await service.fail('job-1', {
      error: 'provider timeout',
      retryDelayMs: 30_000,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'DEAD_LETTER',
        lastError: 'provider timeout',
        deadLetterReason: 'provider timeout',
      }),
    );
  });

  it('completes only the running job that still owns the worker lock', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw.mockResolvedValue([
      row({
        status: 'SUCCEEDED',
        attempts: 1,
        locked_at: null,
        completed_at: now,
      }),
    ]);

    const result = await service.complete('job-1', {
      lockedAt: now,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'SUCCEEDED',
        completedAt: now,
        lockedAt: null,
      }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('recovers stale running jobs after a worker interruption', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw.mockResolvedValue([
      row({
        id: 'job-stale-1',
        status: 'PENDING',
        attempts: 2,
        locked_at: null,
        last_error: 'Recovered stale RUNNING job after worker interruption.',
      }),
    ]);

    const result = await service.recoverStaleRunningJobs({
      kinds: ['PAYMENT_WEBHOOK'],
      olderThanMs: 300_000,
      limit: 10,
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'job-stale-1',
        status: 'PENDING',
        lockedAt: null,
        lastError: 'Recovered stale RUNNING job after worker interruption.',
      }),
    ]);
  });

  it('lists jobs with pagination metadata for admin operations', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        row({
          id: 'job-dead-1',
          status: 'DEAD_LETTER',
          dead_letter_reason: 'provider unavailable',
        }),
      ])
      .mockResolvedValueOnce([{ count: '1' }]);

    const result = await service.list({
      page: 1,
      pageSize: 10,
      kind: 'PAYMENT_WEBHOOK',
      status: 'DEAD_LETTER',
    });

    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        id: 'job-dead-1',
        status: 'DEAD_LETTER',
        deadLetterReason: 'provider unavailable',
      }),
    );
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      pageCount: 1,
    });
  });

  it('requeues dead-letter jobs for another worker attempt', async () => {
    const { prisma, service } = createService();
    prisma.$queryRaw.mockResolvedValue([
      row({
        status: 'PENDING',
        attempts: 5,
        dead_letter_reason: null,
      }),
    ]);

    const result = await service.requeueDeadLetter('job-1');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'job-1',
        status: 'PENDING',
        deadLetterReason: null,
      }),
    );
  });

  it('rejects unknown job families and unsafe retry bounds', async () => {
    const { service } = createService();

    await expect(
      service.enqueue({
        kind: 'UNSAFE' as never,
        payload: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.claimDueJobs({ limit: 101 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.recoverStaleRunningJobs({
        olderThanMs: 59_999,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
