import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { AppLifecycleService } from '../../core/runtime/app-lifecycle.service';
import {
  HealthIncidentJournalService,
  type HealthIncidentHistoryEntry,
} from './health-incident-journal.service';
import { HealthService } from './health.service';

type HealthSnapshot = Awaited<ReturnType<HealthService['check']>>;

@Injectable()
export class HealthWatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthWatchdogService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private checkInFlight = false;
  private lastAlertAt: number | null = null;
  private lastAlertFingerprint: string | null = null;
  private lastPublishedStatus: 'ok' | 'degraded' | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly healthService: HealthService,
    private readonly realtimeService: RealtimeService,
    private readonly appLifecycleService: AppLifecycleService,
    private readonly healthIncidentJournalService: HealthIncidentJournalService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const intervalMs = this.getIntervalMs();

    if (intervalMs <= 0) {
      this.logger.warn(
        'Health watchdog disabled because interval is not positive.',
      );
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.runCheck();
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

  async runCheck() {
    if (!this.appLifecycleService.isLive() || this.checkInFlight) {
      return;
    }

    this.checkInFlight = true;

    try {
      const snapshot = await this.healthService.check();
      this.publishIfNeeded(snapshot);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown health watchdog failure';
      this.logger.error(`Health watchdog check failed: ${message}`);
    } finally {
      this.checkInFlight = false;
    }
  }

  private publishIfNeeded(snapshot: HealthSnapshot) {
    const fingerprint = JSON.stringify({
      status: snapshot.status,
      dependencies: snapshot.dependencies,
      realtime: snapshot.infrastructure.realtime.degradeReason,
      driverReservationExpiry:
        snapshot.operations.driverReservationExpiry.lastFailureMessage,
    });

    if (snapshot.status === 'ok') {
      if (this.lastPublishedStatus === 'degraded') {
        const entry = this.createHistoryEntry(snapshot, 'recovered');

        this.realtimeService.publish({
          channel: 'admin',
          type: 'system.health-recovered',
          entityId: 'orbi-backend',
          actorRole: 'SYSTEM',
          payload: {
            status: snapshot.status,
            dependencies: snapshot.dependencies,
          },
        });
        this.healthIncidentJournalService.record(entry);
        this.lastAlertFingerprint = null;
        this.lastAlertAt = null;
      }

      this.lastPublishedStatus = 'ok';
      return;
    }

    const now = Date.now();
    const cooldownMs = this.getAlertCooldownMs();
    const isCooldownExpired =
      this.lastAlertAt === null || now - this.lastAlertAt >= cooldownMs;
    const isTransition = this.lastPublishedStatus !== 'degraded';
    const hasMeaningfulChange = this.lastAlertFingerprint !== fingerprint;

    if (isTransition || hasMeaningfulChange || isCooldownExpired) {
      const entry = this.createHistoryEntry(snapshot, 'alert');

      this.realtimeService.publish({
        channel: 'admin',
        type: 'system.health-alert',
        entityId: 'orbi-backend',
        actorRole: 'SYSTEM',
        payload: {
          status: snapshot.status,
          dependencies: snapshot.dependencies,
          realtime: snapshot.infrastructure.realtime,
          driverReservationExpiry: snapshot.operations.driverReservationExpiry,
        },
      });
      this.healthIncidentJournalService.record(entry);
      this.lastAlertAt = now;
      this.lastAlertFingerprint = fingerprint;
    }

    this.lastPublishedStatus = 'degraded';
  }

  private getIntervalMs() {
    return (
      this.configService.get<number>('operations.healthWatchdogIntervalMs') ??
      15_000
    );
  }

  private getAlertCooldownMs() {
    return (
      this.configService.get<number>(
        'operations.healthWatchdogAlertCooldownMs',
      ) ?? 60_000
    );
  }

  private createHistoryEntry(
    snapshot: HealthSnapshot,
    tone: 'alert' | 'recovered',
  ): Omit<HealthIncidentHistoryEntry, 'id' | 'createdAt'> & {
    createdAt: string;
  } {
    return {
      tone,
      status: snapshot.status === 'ok' ? 'ok' : 'degraded',
      title:
        tone === 'alert' ? 'Alerte systeme publiee' : 'Sante systeme retablie',
      detail: this.describeHealthDetail(snapshot),
      createdAt: snapshot.timestamp,
      acknowledgedAt: null,
      acknowledgedBy: null,
      mutedAt: null,
      mutedBy: null,
    };
  }

  private describeHealthDetail(snapshot: HealthSnapshot) {
    if (snapshot.infrastructure.realtime.degradeReason) {
      return snapshot.infrastructure.realtime.degradeReason;
    }

    if (snapshot.operations.driverReservationExpiry.lastFailureMessage) {
      return snapshot.operations.driverReservationExpiry.lastFailureMessage;
    }

    if (snapshot.dependencies.database === 'down') {
      return 'La base de donnees ne repond plus correctement.';
    }

    return snapshot.status === 'ok'
      ? 'Toutes les dependances critiques sont revenues a un etat sain.'
      : 'Le backend signale un etat degrade qui demande une action ops.';
  }
}
