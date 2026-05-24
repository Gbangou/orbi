import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { JobQueueService } from '../../common/job-queue/job-queue.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { AppLifecycleService } from '../../core/runtime/app-lifecycle.service';
import { DriverReservationExpiryService } from '../drivers/driver-reservation-expiry.service';
import { resolvePaymentFixtureProductionReadiness } from '../payments/payment-fixture-manifest';
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
    private readonly jobQueueService: JobQueueService,
  ) {}

  async check() {
    let databaseStatus: 'up' | 'down' = 'up';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseStatus = 'down';
    }

    const memoryUsage = process.memoryUsage();
    const rateLimitSnapshot = await this.rateLimitService.snapshot();
    const realtimeSnapshot = this.realtimeService.snapshot();
    const rateLimitStrict = this.configBoolean(
      'infrastructure.rateLimit.strict',
    );
    const realtimeStrict = this.configBoolean('infrastructure.realtime.strict');
    const rateLimitStatus =
      !rateLimitSnapshot.degraded || !rateLimitStrict ? 'up' : 'degraded';
    const realtimeStatus =
      !realtimeSnapshot.degraded || !realtimeStrict ? 'up' : 'degraded';
    const driverReservationExpirySnapshot =
      this.driverReservationExpiryService.snapshot();
    const jobQueueSnapshot = await this.jobQueueService.snapshot();
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
      service: 'orbi-backend',
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
        jobQueue: jobQueueSnapshot,
      },
      operations: {
        productionReadiness: this.buildProductionReadiness({
          rateLimitSnapshot,
          realtimeSnapshot,
          rateLimitStrict,
          realtimeStrict,
        }),
        serviceLevelObjectives: this.buildServiceLevelObjectives({
          databaseStatus,
          rateLimitStatus,
          realtimeStatus,
          driverReservationExpiryStatus,
          paymentProvider:
            this.configService.get<string>('payments.provider') ??
            'flutterwave',
          refundMode:
            this.configService.get<string>('payments.refunds.mode') ?? 'manual',
          lifecycleState: this.appLifecycleService.snapshot().state,
        }),
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

  private buildProductionReadiness(input: {
    rateLimitSnapshot: {
      adapter: string;
      sharedBackplane: boolean;
      degraded: boolean;
    };
    realtimeSnapshot: {
      adapter: string;
      sharedBackplane: boolean;
      degraded: boolean;
    };
    rateLimitStrict: boolean;
    realtimeStrict: boolean;
  }) {
    const environment =
      this.configService.get<string>('app.environment') ??
      process.env.NODE_ENV ??
      'development';
    const paymentWebhookSecret =
      this.configService.get<string>('payments.webhookSecret') ?? '';
    const documentSigningSecret =
      this.configService.get<string>('documents.signingSecret') ?? '';
    const paymentRedirectUrl =
      this.configService.get<string>('payments.defaultRedirectUrl') ?? '';
    const paymentWebhookUrl =
      this.configService.get<string>('payments.defaultWebhookUrl') ?? '';
    const paymentProvider =
      this.configService.get<string>('payments.provider') ?? 'flutterwave';
    const refundMode =
      this.configService.get<string>('payments.refunds.mode') ?? 'manual';
    const flutterwaveSecretKey =
      this.configService.get<string>('payments.flutterwave.secretKey') ?? '';
    const mobileErrorCollectorProvider =
      this.configService.get<string>(
        'observability.mobileErrorCollector.provider',
      ) ?? 'local';
    const mobileErrorCollectorWebhookUrl =
      this.configService.get<string>(
        'observability.mobileErrorCollector.webhookUrl',
      ) ?? '';
    const paymentFixtureReadiness = resolvePaymentFixtureProductionReadiness();
    const checks = [
      {
        id: 'rate-limit-backplane',
        label: 'Rate limit partage',
        state:
          input.rateLimitSnapshot.sharedBackplane || !input.rateLimitStrict
            ? ('pass' as const)
            : ('fail' as const),
        detail: input.rateLimitSnapshot.sharedBackplane
          ? `Adapter ${input.rateLimitSnapshot.adapter} avec backplane partage.`
          : input.rateLimitStrict
            ? 'Mode strict actif sans backplane rate-limit partage.'
            : 'Mode non strict; acceptable en local/preprod mono-instance.',
      },
      {
        id: 'realtime-backplane',
        label: 'Realtime partage',
        state:
          input.realtimeSnapshot.sharedBackplane || !input.realtimeStrict
            ? ('pass' as const)
            : ('fail' as const),
        detail: input.realtimeSnapshot.sharedBackplane
          ? `Adapter ${input.realtimeSnapshot.adapter} avec backplane partage.`
          : input.realtimeStrict
            ? 'Mode strict actif sans backplane realtime partage.'
            : 'Mode non strict; acceptable en local/preprod mono-instance.',
      },
      {
        id: 'payment-webhook-secret',
        label: 'Secret webhook paiement',
        state:
          paymentWebhookSecret &&
          paymentWebhookSecret !== 'orbi_dev_webhook_secret'
            ? ('pass' as const)
            : environment === 'production'
              ? ('fail' as const)
              : ('warn' as const),
        detail:
          paymentWebhookSecret &&
          paymentWebhookSecret !== 'orbi_dev_webhook_secret'
            ? 'Secret webhook explicite configure.'
            : 'Secret webhook dev ou absent; interdit en production.',
      },
      {
        id: 'document-signing-secret',
        label: 'Secret documents',
        state:
          documentSigningSecret &&
          documentSigningSecret !== 'orbi_dev_document_secret'
            ? ('pass' as const)
            : environment === 'production'
              ? ('fail' as const)
              : ('warn' as const),
        detail:
          documentSigningSecret &&
          documentSigningSecret !== 'orbi_dev_document_secret'
            ? 'Secret de signature documents explicite configure.'
            : 'Secret documents dev ou absent; interdit en production.',
      },
      {
        id: 'payment-public-urls',
        label: 'URLs paiement publiques',
        state:
          containsLocalhost(paymentRedirectUrl) ||
          containsLocalhost(paymentWebhookUrl) ||
          !paymentRedirectUrl ||
          !paymentWebhookUrl
            ? environment === 'production'
              ? ('fail' as const)
              : ('warn' as const)
            : ('pass' as const),
        detail:
          containsLocalhost(paymentRedirectUrl) ||
          containsLocalhost(paymentWebhookUrl) ||
          !paymentRedirectUrl ||
          !paymentWebhookUrl
            ? 'Redirect/webhook paiement local ou incomplet.'
            : 'Redirect/webhook paiement publics configures.',
      },
      {
        id: 'provider-refunds',
        label: 'Refunds provider',
        state:
          refundMode === 'provider' &&
          paymentProvider === 'flutterwave' &&
          !flutterwaveSecretKey
            ? ('fail' as const)
            : refundMode === 'provider'
              ? ('pass' as const)
              : ('warn' as const),
        detail:
          refundMode === 'provider'
            ? 'Refund provider actif; verifier les fixtures sandbox.'
            : 'Refunds en mode manual/console; acceptable avant provider live.',
      },
      {
        id: 'payment-provider-evidence',
        label: 'Preuves provider paiement',
        state: paymentFixtureReadiness.isPilotReady
          ? ('pass' as const)
          : environment === 'production'
            ? ('fail' as const)
            : ('warn' as const),
        detail: paymentFixtureReadiness.summary,
      },
      {
        id: 'mobile-error-collector',
        label: 'Collector erreurs mobiles',
        state:
          mobileErrorCollectorProvider === 'webhook' &&
          isHttpsUrl(mobileErrorCollectorWebhookUrl) &&
          !containsLocalhost(mobileErrorCollectorWebhookUrl)
            ? ('pass' as const)
            : environment === 'production'
              ? ('fail' as const)
              : ('warn' as const),
        detail:
          mobileErrorCollectorProvider === 'webhook' &&
          isHttpsUrl(mobileErrorCollectorWebhookUrl) &&
          !containsLocalhost(mobileErrorCollectorWebhookUrl)
            ? 'Collector mobile externe HTTPS configure.'
            : 'Collector mobile local ou incomplet; interdit en production.',
      },
    ];
    const failedChecks = checks.filter(
      (check) => check.state === 'fail',
    ).length;
    const warningChecks = checks.filter(
      (check) => check.state === 'warn',
    ).length;

    return {
      environment,
      riskLevel: failedChecks
        ? ('high' as const)
        : warningChecks
          ? ('medium' as const)
          : ('low' as const),
      failedChecks,
      warningChecks,
      checks,
    };
  }

  private buildServiceLevelObjectives(input: {
    databaseStatus: 'up' | 'down';
    rateLimitStatus: 'up' | 'degraded';
    realtimeStatus: 'up' | 'degraded';
    driverReservationExpiryStatus: 'up' | 'degraded' | 'disabled';
    paymentProvider: string;
    refundMode: string;
    lifecycleState: string;
  }) {
    const objectives = [
      {
        id: 'critical-api-availability',
        label: 'Disponibilite API critique',
        target: '>= 99.9%',
        window: 'rolling-30d',
        owner: 'engineering' as const,
        state:
          input.databaseStatus === 'up' && input.lifecycleState === 'ready'
            ? ('pass' as const)
            : ('fail' as const),
        currentSignal:
          input.databaseStatus === 'up'
            ? `Lifecycle ${input.lifecycleState}.`
            : 'Base de donnees indisponible.',
        burnRate: input.databaseStatus === 'up' ? 'normal' : 'critical',
      },
      {
        id: 'booking-p95-latency',
        label: 'Creation course p95',
        target: '< 400 ms hors provider externe',
        window: 'rolling-1h',
        owner: 'engineering' as const,
        state:
          input.databaseStatus === 'up' && input.rateLimitStatus === 'up'
            ? ('pass' as const)
            : ('warn' as const),
        currentSignal:
          input.rateLimitStatus === 'up'
            ? 'DB et anti-abus disponibles pour le chemin booking.'
            : 'Rate-limit degrade: risque de latence ou abus non borne.',
        burnRate: input.rateLimitStatus === 'up' ? 'normal' : 'elevated',
      },
      {
        id: 'realtime-critical-event-latency',
        label: 'Evenement realtime critique p95',
        target: '< 2 s',
        window: 'rolling-15m',
        owner: 'engineering' as const,
        state:
          input.realtimeStatus === 'up' ? ('pass' as const) : ('fail' as const),
        currentSignal:
          input.realtimeStatus === 'up'
            ? 'Transport realtime operationnel.'
            : 'Transport realtime degrade: fallback polling/ops requis.',
        burnRate: input.realtimeStatus === 'up' ? 'normal' : 'critical',
      },
      {
        id: 'payment-traceability',
        label: 'Paiement trace ou repris',
        target: '100% des webhooks',
        window: 'per-event',
        owner: 'finance' as const,
        state:
          input.paymentProvider && input.refundMode
            ? ('pass' as const)
            : ('warn' as const),
        currentSignal: `Provider ${input.paymentProvider}; refunds ${input.refundMode}.`,
        burnRate: 'normal',
      },
      {
        id: 'reservation-expiry-sweeper',
        label: 'Reservation chauffeur expiree',
        target: '< 30 s de silence',
        window: 'rolling-5m',
        owner: 'ops' as const,
        state:
          input.driverReservationExpiryStatus === 'up'
            ? ('pass' as const)
            : input.driverReservationExpiryStatus === 'disabled'
              ? ('warn' as const)
              : ('fail' as const),
        currentSignal: `Sweeper ${input.driverReservationExpiryStatus}.`,
        burnRate:
          input.driverReservationExpiryStatus === 'up'
            ? 'normal'
            : input.driverReservationExpiryStatus === 'disabled'
              ? 'elevated'
              : 'critical',
      },
    ];
    const failingObjectives = objectives.filter(
      (objective) => objective.state === 'fail',
    ).length;
    const warningObjectives = objectives.filter(
      (objective) => objective.state === 'warn',
    ).length;

    return {
      posture: failingObjectives
        ? ('breached' as const)
        : warningObjectives
          ? ('watch' as const)
          : ('healthy' as const),
      failingObjectives,
      warningObjectives,
      objectives,
      mobileErrorTaxonomy: [
        {
          code: 'MOB-AUTH-SESSION',
          surface: 'rider-driver-auth',
          severity: 'high' as const,
          owner: 'engineering' as const,
          retryPolicy: 'silent-refresh-once-then-relogin',
          userMessage: 'Session expiree. Reconnecte-toi pour continuer.',
        },
        {
          code: 'MOB-BOOKING-DISPATCH',
          surface: 'rider-booking',
          severity: 'critical' as const,
          owner: 'ops' as const,
          retryPolicy: 'idempotent-retry-with-visible-status',
          userMessage:
            'La demande est en verification. Aucun double trajet ne sera cree.',
        },
        {
          code: 'MOB-PAYMENT-PROVIDER',
          surface: 'payments',
          severity: 'critical' as const,
          owner: 'finance' as const,
          retryPolicy: 'server-reconcile-before-client-retry',
          userMessage:
            'Paiement en verification. Le support voit deja la transaction.',
        },
        {
          code: 'MOB-REALTIME-DEGRADED',
          surface: 'active-trip',
          severity: 'medium' as const,
          owner: 'engineering' as const,
          retryPolicy: 'fallback-polling-with-last-known-state',
          userMessage:
            'Connexion live instable. Le trajet reste suivi par Orbi.',
        },
        {
          code: 'MOB-SAFETY-INCIDENT',
          surface: 'safety',
          severity: 'critical' as const,
          owner: 'support' as const,
          retryPolicy: 'store-local-and-escalate-to-support',
          userMessage:
            'Alerte securite recue. Le support peut suivre le dossier.',
        },
      ],
    };
  }

  private configBoolean(key: string) {
    const value = this.configService.get<boolean | string>(key);

    return value === true || value === 'true';
  }
}

function containsLocalhost(value: string) {
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(value);
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
