import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppLifecycleService } from '../../core/runtime/app-lifecycle.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import { PaymentsService } from './payments.service';

const STALE_ATTEMPT_STATUSES = ['INITIATED', 'PENDING'] as const;

/**
 * Filet de sécurité pour les paiements dont le webhook du fournisseur n'est
 * jamais arrivé (panne réseau, webhook mal configuré, incident fournisseur) :
 * sans ce sweep, une PaymentAttempt reste bloquée en INITIATED/PENDING pour
 * toujours, sauf intervention manuelle d'un admin — un risque réel de perte
 * d'argent pour un paiement en fait déjà réussi côté fournisseur.
 */
@Injectable()
export class PaymentAttemptReconciliationSweepService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    PaymentAttemptReconciliationSweepService.name,
  );
  private intervalHandle: NodeJS.Timeout | null = null;
  private sweepInFlight = false;
  private lastStartedAt: Date | null = null;
  private lastCompletedAt: Date | null = null;
  private lastSucceededAt: Date | null = null;
  private lastFailedAt: Date | null = null;
  private lastFailureMessage: string | null = null;
  private lastDurationMs: number | null = null;
  private lastCheckedCount = 0;
  private lastReconciledCount = 0;
  private lastReconciliationErrorCount = 0;
  private totalSweeps = 0;
  private consecutiveFailures = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly appLifecycleService: AppLifecycleService,
    private readonly prisma: PrismaService,
    private readonly jobQueueService: JobQueueService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    if (this.intervalHandle) {
      this.logger.warn(
        'Payment attempt reconciliation sweeper already started; skipping duplicate initialization.',
      );
      return;
    }

    const intervalMs = this.getSweepIntervalMs();

    if (intervalMs <= 0) {
      this.logger.warn(
        'Payment attempt reconciliation sweeper disabled because interval is not positive.',
      );
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.enqueueSweep();
    }, intervalMs);
    this.intervalHandle.unref?.();
  }

  onModuleDestroy() {
    if (!this.intervalHandle) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  async runSweep() {
    if (!this.appLifecycleService.isReady() || this.sweepInFlight) {
      return;
    }

    this.sweepInFlight = true;
    const startedAt = new Date();
    const startedAtMs = startedAt.getTime();
    this.lastStartedAt = startedAt;

    try {
      const staleAttempts = await this.prisma.paymentAttempt.findMany({
        where: {
          status: { in: [...STALE_ATTEMPT_STATUSES] },
          createdAt: { lte: new Date(Date.now() - this.getStaleAfterMs()) },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: this.getBatchSize(),
      });

      let reconciledCount = 0;
      let errorCount = 0;

      for (const attempt of staleAttempts) {
        try {
          await this.paymentsService.verifyPaymentAttemptWithProvider(
            attempt.id,
          );
          reconciledCount += 1;
        } catch (error) {
          errorCount += 1;
          this.logger.error(
            `Failed to reconcile stale payment attempt ${attempt.id}: ${this.errorMessage(error)}`,
          );
        }
      }

      const completedAt = new Date();

      this.totalSweeps += 1;
      this.consecutiveFailures = 0;
      this.lastCompletedAt = completedAt;
      this.lastSucceededAt = completedAt;
      this.lastDurationMs = completedAt.getTime() - startedAtMs;
      this.lastCheckedCount = staleAttempts.length;
      this.lastReconciledCount = reconciledCount;
      this.lastReconciliationErrorCount = errorCount;
      this.lastFailureMessage = null;

      if (staleAttempts.length > 0) {
        this.logger.log(
          `Checked ${staleAttempts.length} stale payment attempt(s) against their provider — ${reconciledCount} reconciled, ${errorCount} failed.`,
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      const failedAt = new Date();

      this.totalSweeps += 1;
      this.consecutiveFailures += 1;
      this.lastCompletedAt = failedAt;
      this.lastFailedAt = failedAt;
      this.lastDurationMs = failedAt.getTime() - startedAtMs;
      this.lastFailureMessage = message;
      this.logger.error(`Payment attempt reconciliation sweep failed: ${message}`);
    } finally {
      this.sweepInFlight = false;
    }
  }

  async enqueueSweep() {
    if (!this.appLifecycleService.isReady()) {
      return null;
    }

    return this.jobQueueService.enqueue({
      kind: 'PAYMENT_ATTEMPT_RECONCILIATION_SWEEP',
      dedupeKey: 'payment-attempt-reconciliation:sweep',
      entityType: 'payment_attempt_reconciliation',
      entityId: 'sweep',
      payload: {
        requestedAt: new Date().toISOString(),
      },
      maxAttempts: 3,
      resetSucceededOnDedupe: true,
    });
  }

  snapshot() {
    const intervalMs = this.getSweepIntervalMs();
    const enabled = intervalMs > 0;

    return {
      enabled,
      intervalMs,
      staleAfterMs: this.getStaleAfterMs(),
      batchSize: this.getBatchSize(),
      inFlight: this.sweepInFlight,
      totalSweeps: this.totalSweeps,
      consecutiveFailures: this.consecutiveFailures,
      lastCheckedCount: this.lastCheckedCount,
      lastReconciledCount: this.lastReconciledCount,
      lastReconciliationErrorCount: this.lastReconciliationErrorCount,
      lastStartedAt: this.lastStartedAt?.toISOString() ?? null,
      lastCompletedAt: this.lastCompletedAt?.toISOString() ?? null,
      lastSucceededAt: this.lastSucceededAt?.toISOString() ?? null,
      lastFailedAt: this.lastFailedAt?.toISOString() ?? null,
      lastFailureMessage: this.lastFailureMessage,
      lastDurationMs: this.lastDurationMs,
    };
  }

  private getSweepIntervalMs() {
    return (
      this.configService.get<number>(
        'operations.paymentAttemptReconciliationSweepIntervalMs',
      ) ?? 120_000
    );
  }

  private getStaleAfterMs() {
    return (
      this.configService.get<number>(
        'operations.paymentAttemptReconciliationStaleAfterMs',
      ) ?? 600_000
    );
  }

  private getBatchSize() {
    return (
      this.configService.get<number>(
        'operations.paymentAttemptReconciliationBatchSize',
      ) ?? 25
    );
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown sweep failure';
  }
}
