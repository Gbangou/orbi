import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DocumentObjectStorageService } from '../document-links/document-object-storage.service';
import { DriverReservationExpiryService } from '../../modules/drivers/driver-reservation-expiry.service';
import { PaymentsService } from '../../modules/payments/payments.service';
import {
  JobQueueEntry,
  JobQueueKind,
  JobQueueService,
} from './job-queue.service';
import { DocumentSafetyScannerService } from './document-safety-scanner.service';
import { NotificationDeliveryService } from './notification-delivery.service';

type WorkerRunResult = {
  claimed: number;
  completed: number;
  failed: number;
};

@Injectable()
export class JobQueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobQueueWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jobQueueService: JobQueueService,
    private readonly notificationDeliveryService: NotificationDeliveryService,
    private readonly documentSafetyScannerService: DocumentSafetyScannerService,
    private readonly documentObjectStorageService: DocumentObjectStorageService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit() {
    const environment =
      this.configService.get<string>('app.environment') ?? 'development';
    const explicitlyEnabled = process.env.JOB_QUEUE_WORKER_ENABLED === 'true';
    const enabled =
      this.configService.get<boolean>('operations.jobQueueWorkerEnabled') ??
      true;

    if (!enabled || (environment === 'test' && !explicitlyEnabled)) {
      return;
    }

    const intervalMs = this.resolvePositiveInteger(
      this.configService.get<number>('operations.jobQueueWorkerIntervalMs'),
      5_000,
      1_000,
      300_000,
    );

    this.timer = setInterval(() => {
      void this.processDueJobs().catch((error) => {
        this.logger.error(
          `Durable job queue worker failed: ${this.errorMessage(error)}`,
        );
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processDueJobs(input: {
    kinds?: JobQueueKind[];
    limit?: number;
  } = {}): Promise<WorkerRunResult> {
    if (this.running) {
      return {
        claimed: 0,
        completed: 0,
        failed: 0,
      };
    }

    this.running = true;

    try {
      const limit =
        input.limit ??
        this.resolvePositiveInteger(
          this.configService.get<number>('operations.jobQueueWorkerBatchSize'),
          10,
          1,
          100,
        );
      await this.jobQueueService.recoverStaleRunningJobs({
        kinds: input.kinds,
        limit,
        olderThanMs: this.resolvePositiveInteger(
          this.configService.get<number>(
            'operations.jobQueueWorkerStaleAfterMs',
          ),
          300_000,
          60_000,
          86_400_000,
        ),
      });
      const jobs = await this.jobQueueService.claimDueJobs({
        kinds: input.kinds,
        limit,
      });
      let completed = 0;
      let failed = 0;

      for (const job of jobs) {
        try {
          await this.handleJob(job);
          await this.jobQueueService.complete(job.id, {
            lockedAt: job.lockedAt,
          });
          completed += 1;
        } catch (error) {
          failed += 1;
          await this.jobQueueService.fail(job.id, {
            error: this.errorMessage(error),
            retryDelayMs: this.retryDelayMs(job),
            deadLetterReason: this.deadLetterReason(job, error),
            lockedAt: job.lockedAt,
          });
        }
      }

      return {
        claimed: jobs.length,
        completed,
        failed,
      };
    } finally {
      this.running = false;
    }
  }

  private async handleJob(job: JobQueueEntry) {
    if (job.kind === 'PAYMENT_WEBHOOK') {
      await this.handlePaymentWebhookJob(job);
      return;
    }

    if (job.kind === 'PAYMENT_REFUND_VERIFICATION') {
      await this.handlePaymentRefundVerificationJob(job);
      return;
    }

    if (job.kind === 'DRIVER_DOCUMENT') {
      await this.handleDriverDocumentJob(job);
      return;
    }

    if (job.kind === 'DRIVER_RESERVATION_EXPIRY') {
      await this.handleDriverReservationExpiryJob();
      return;
    }

    await this.handleNotificationJob(job);
  }

  private async handlePaymentWebhookJob(job: JobQueueEntry) {
    const payload = this.payloadRecord(job.payload);
    const eventId = this.requiredString(payload.eventId, 'eventId');
    const event = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        action: true,
        signatureVerified: true,
        paymentAttemptId: true,
        transactionRef: true,
      },
    });

    if (!event) {
      throw new Error('payment_webhook_event_missing');
    }

    if (
      event.action === 'ignored_unknown_reference' &&
      event.transactionRef
    ) {
      const targetAttempt = await this.prisma.paymentAttempt.findUnique({
        where: {
          transactionRef: event.transactionRef,
        },
        select: {
          id: true,
        },
      });

      if (!targetAttempt) {
        throw new Error('payment_webhook_unknown_reference_pending');
      }

      const paymentsService = this.moduleRef.get(PaymentsService, {
        strict: false,
      });
      const replay = await paymentsService.replayStoredWebhookEvent(event.id);

      if (replay.result.nextAction === 'ignored_unknown_reference') {
        throw new Error('payment_webhook_unknown_reference_pending');
      }

      return;
    }

    if (event.action.includes('ignored') || event.action.includes('conflicting')) {
      this.logger.warn(
        `Payment webhook ${event.id} requires operations review before replay.`,
      );
    }
  }

  private async handlePaymentRefundVerificationJob(job: JobQueueEntry) {
    const payload = this.payloadRecord(job.payload);
    const paymentAttemptId = this.requiredString(
      payload.paymentAttemptId,
      'paymentAttemptId',
    );
    const paymentsService = this.moduleRef.get(PaymentsService, {
      strict: false,
    });
    const verification =
      await paymentsService.verifyPaymentAttemptWithProvider(paymentAttemptId);
    const nextAction = verification.result.nextAction;

    if (nextAction === 'refund_still_pending') {
      throw new Error('payment_refund_still_pending');
    }
  }

  private async handleDriverDocumentJob(job: JobQueueEntry) {
    const payload = this.payloadRecord(job.payload);
    const documentId = this.requiredString(payload.documentId, 'documentId');
    const document = await this.prisma.driverDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
        type: true,
        fileName: true,
        storageKey: true,
        metadata: true,
      },
    });

    if (!document) {
      throw new Error('driver_document_missing');
    }

    const metadata = this.payloadRecord(document.metadata);
    const integrity = this.payloadRecord(metadata.integrity);
    const objectVerification =
      await this.documentObjectStorageService.verifyStoredDocument({
        storageKey: document.storageKey,
        expectedSizeBytes: this.positiveInteger(integrity.sizeBytes),
        expectedSha256: this.optionalString(integrity.sha256),
      });
    const metadataWithVerification = {
      ...metadata,
      objectVerification,
    };
    const safetyScan = await this.documentSafetyScannerService.scan({
      documentId: document.id,
      type: document.type,
      fileName: document.fileName,
      storageKey: document.storageKey,
      metadata: metadataWithVerification,
    });

    await this.prisma.driverDocument.update({
      where: {
        id: document.id,
      },
      data: {
        metadata: {
          ...metadataWithVerification,
          safetyScan,
        },
      },
    });

    if (safetyScan.state === 'quarantined') {
      this.logger.warn(
        `Driver document ${document.id} is quarantined and awaiting review.`,
      );
    }
  }

  private async handleNotificationJob(job: JobQueueEntry) {
    const payload = this.payloadRecord(job.payload);
    const notificationId = this.requiredString(
      payload.notificationId,
      'notificationId',
    );
    const userId = this.requiredString(payload.userId, 'userId');
    const channel = this.requiredString(payload.channel, 'channel');
    const notification = await this.prisma.notification.findUnique({
      where: {
        id: notificationId,
      },
      select: {
        id: true,
        sentAt: true,
      },
    });

    if (!notification) {
      throw new Error('notification_missing');
    }

    if (notification.sentAt) {
      return;
    }

    const delivery = await this.notificationDeliveryService.dispatch({
      notificationId,
      userId,
      channel: channel as NotificationChannel,
    });
    const updated = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        sentAt: null,
      },
      data: {
        sentAt: delivery.deliveredAt,
      },
    });

    if (updated.count === 0) {
      throw new Error('notification_delivery_race_detected');
    }
  }

  private async handleDriverReservationExpiryJob() {
    const reservationExpiryService = this.moduleRef.get(
      DriverReservationExpiryService,
      { strict: false },
    );

    await reservationExpiryService.runSweep();
  }

  private payloadRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`job_payload_${field}_missing`);
    }

    return value.trim();
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase()
      : null;
  }

  private positiveInteger(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : null;
  }

  private retryDelayMs(job: JobQueueEntry) {
    const baseDelayMs = this.resolvePositiveInteger(
      this.configService.get<number>('operations.jobQueueWorkerRetryDelayMs'),
      30_000,
      1_000,
      3_600_000,
    );
    const exponent = Math.min(job.attempts, 6);

    return Math.min(baseDelayMs * 2 ** exponent, 3_600_000);
  }

  private deadLetterReason(job: JobQueueEntry, error: unknown) {
    const message = this.errorMessage(error);

    return `${job.kind.toLowerCase()}_worker_failed:${message}`.slice(0, 500);
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'unknown_error';
  }

  private resolvePositiveInteger(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    const resolved = Number.isInteger(value) ? (value as number) : fallback;

    return Math.min(Math.max(resolved, min), max);
  }
}
