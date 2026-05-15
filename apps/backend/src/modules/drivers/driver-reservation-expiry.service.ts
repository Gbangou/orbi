import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLifecycleService } from '../../core/runtime/app-lifecycle.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import { DispatchCoordinator } from './dispatch-coordinator.service';

@Injectable()
export class DriverReservationExpiryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DriverReservationExpiryService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private sweepInFlight = false;
  private lastStartedAt: Date | null = null;
  private lastCompletedAt: Date | null = null;
  private lastSucceededAt: Date | null = null;
  private lastFailedAt: Date | null = null;
  private lastFailureMessage: string | null = null;
  private lastDurationMs: number | null = null;
  private lastExpiredReservations = 0;
  private totalSweeps = 0;
  private consecutiveFailures = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly appLifecycleService: AppLifecycleService,
    private readonly dispatchCoordinator: DispatchCoordinator,
    private readonly jobQueueService: JobQueueService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    if (this.intervalHandle) {
      this.logger.warn(
        'Driver reservation expiry sweeper already started; skipping duplicate initialization.',
      );
      return;
    }

    const intervalMs = this.getSweepIntervalMs();

    if (intervalMs <= 0) {
      this.logger.warn(
        'Driver reservation expiry sweeper disabled because interval is not positive.',
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
      const expiredReservations =
        await this.dispatchCoordinator.expireStaleReservations();
      const completedAt = new Date();

      this.totalSweeps += 1;
      this.consecutiveFailures = 0;
      this.lastCompletedAt = completedAt;
      this.lastSucceededAt = completedAt;
      this.lastDurationMs = completedAt.getTime() - startedAtMs;
      this.lastExpiredReservations = expiredReservations;
      this.lastFailureMessage = null;

      if (expiredReservations > 0) {
        this.logger.log(
          `Expired ${expiredReservations} stale driver reservations.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown sweep failure';
      const failedAt = new Date();

      this.totalSweeps += 1;
      this.consecutiveFailures += 1;
      this.lastCompletedAt = failedAt;
      this.lastFailedAt = failedAt;
      this.lastDurationMs = failedAt.getTime() - startedAtMs;
      this.lastFailureMessage = message;
      this.logger.error(`Driver reservation expiry sweep failed: ${message}`);
    } finally {
      this.sweepInFlight = false;
    }
  }

  async enqueueSweep() {
    if (!this.appLifecycleService.isReady()) {
      return null;
    }

    return this.jobQueueService.enqueue({
      kind: 'DRIVER_RESERVATION_EXPIRY',
      dedupeKey: 'driver-reservation-expiry:sweep',
      entityType: 'driver_reservation_expiry',
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
      inFlight: this.sweepInFlight,
      totalSweeps: this.totalSweeps,
      consecutiveFailures: this.consecutiveFailures,
      lastExpiredReservations: this.lastExpiredReservations,
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
        'operations.driverReservationExpirySweepIntervalMs',
      ) ?? 5_000
    );
  }
}
