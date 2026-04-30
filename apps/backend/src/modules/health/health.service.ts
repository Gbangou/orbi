import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { AppLifecycleService } from '../../core/runtime/app-lifecycle.service';
import { DriverReservationExpiryService } from '../drivers/driver-reservation-expiry.service';
import { HealthIncidentJournalService } from './health-incident-journal.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly rateLimitService: RateLimitService,
    private readonly realtimeService: RealtimeService,
    private readonly appLifecycleService: AppLifecycleService,
    private readonly driverReservationExpiryService: DriverReservationExpiryService,
    private readonly healthIncidentJournalService: HealthIncidentJournalService,
  ) {}

  async check() {
    let databaseStatus: 'up' | 'down' = 'up';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseStatus = 'down';
    }

    const memoryUsage = process.memoryUsage();
    const rateLimitSnapshot = this.rateLimitService.snapshot();
    const realtimeSnapshot = this.realtimeService.snapshot();
    const rateLimitStrict =
      this.configService.get<boolean>('infrastructure.rateLimit.strict') ??
      false;
    const realtimeStrict =
      this.configService.get<boolean>('infrastructure.realtime.strict') ??
      false;
    const rateLimitStatus =
      !rateLimitSnapshot.degraded || !rateLimitStrict ? 'up' : 'degraded';
    const realtimeStatus =
      !realtimeSnapshot.degraded || !realtimeStrict ? 'up' : 'degraded';
    const driverReservationExpirySnapshot =
      this.driverReservationExpiryService.snapshot();
    const driverReservationExpiryStatus =
      this.resolveDriverReservationExpiryStatus(
        driverReservationExpirySnapshot,
      );

    return {
      status:
        databaseStatus === 'up' &&
        rateLimitStatus === 'up' &&
        realtimeStatus === 'up' &&
        driverReservationExpiryStatus !== 'degraded'
          ? 'ok'
          : 'degraded',
      service: 'mobilis-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      runtime: {
        nodeVersion: process.version,
        pid: process.pid,
        memory: {
          rss: memoryUsage.rss,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
        },
      },
      dependencies: {
        database: databaseStatus,
        rateLimit: rateLimitStatus,
        realtime: realtimeStatus,
        driverReservationExpiry: driverReservationExpiryStatus,
      },
      lifecycle: this.appLifecycleService.snapshot(),
      infrastructure: {
        rateLimit: {
          configuredAdapter:
            this.configService.get<string>('infrastructure.rateLimitAdapter') ??
            'in-memory',
          strict: rateLimitStrict,
          ...rateLimitSnapshot,
        },
        realtime: {
          configuredAdapter:
            this.configService.get<string>('infrastructure.realtimeAdapter') ??
            'in-memory',
          strict: realtimeStrict,
          ...realtimeSnapshot,
        },
      },
      operations: {
        driverReservationExpiry: driverReservationExpirySnapshot,
        healthHistory: this.healthIncidentJournalService.list(),
      },
    };
  }

  live() {
    return {
      status: this.appLifecycleService.isLive() ? 'live' : 'stopped',
      lifecycle: this.appLifecycleService.snapshot(),
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const health = await this.check();

    return {
      status:
        health.status === 'ok' && this.appLifecycleService.isReady()
          ? 'ready'
          : 'not_ready',
      lifecycle: this.appLifecycleService.snapshot(),
      dependencies: health.dependencies,
      timestamp: new Date().toISOString(),
    };
  }

  private resolveDriverReservationExpiryStatus(snapshot: {
    enabled: boolean;
    intervalMs: number;
    inFlight: boolean;
    consecutiveFailures: number;
    lastSucceededAt: string | null;
  }) {
    if (!snapshot.enabled) {
      return 'disabled';
    }

    if (snapshot.consecutiveFailures > 0) {
      return 'degraded';
    }

    const maxSilenceMs =
      this.configService.get<number>(
        'operations.driverReservationExpiryMaxSilenceMs',
      ) ?? Math.max(snapshot.intervalMs * 3, 30_000);

    if (!snapshot.lastSucceededAt) {
      return this.appLifecycleService.isReady() ? 'degraded' : 'up';
    }

    const lastSucceededAt = new Date(snapshot.lastSucceededAt).getTime();

    if (Date.now() - lastSucceededAt > maxSilenceMs && !snapshot.inFlight) {
      return 'degraded';
    }

    return 'up';
  }
}
