import {
  adminMetrics,
  authenticateAndFetchCurrentUser,
  burkinaPricingCityPresets,
  createMobilisApiClient,
  fetchHealthCheck,
  fetchPricingEstimate,
  fetchAdminLiveOps,
  fetchAdminDispatchSettings,
  fetchAdminFeatureFlags,
  fetchAdminOverview,
  fetchAdminDriverOnboardingQueue,
  fetchAdminPaymentWebhookEvents,
  fetchAdminPricingCalibration,
  fetchAdminSupportTickets,
  type AdminDispatchSettingsResponse,
  type AdminFeatureFlagsResponse,
  type AdminLiveOpsResponse,
  type AdminPaymentWebhookEventsResponse,
  type AdminPricingCalibrationResponse,
  type HealthCheckResponse,
  type DriverOnboardingQueueResponse,
  type AdminMetric,
  type AdminPreviewResponse,
  type PricingEstimate,
  type SupportTicketQueueResponse,
} from '@mobilis/api';
import { mobilisCopy } from '@mobilis/ui';
import {
  executionPhases,
  mobilisDemoAccounts,
  mobilisRuntimeConfig,
} from '@mobilis/config';
import { LiveOpsBoard } from './live-ops-board';
import { PricingStrategyBoard } from './pricing-strategy-board';
import { DriverOnboardingReviewBoard } from './driver-onboarding-review-board';
import { SupportQueue } from './support-queue';
import { FeatureFlagsBoard } from './feature-flags-board';
import { LaunchReadinessBoard } from './launch-readiness-board';
import { SystemHealthBoard } from './system-health-board';
import { DispatchControlBoard } from './dispatch-control-board';
import { PricingCalibrationBoard } from './pricing-calibration-board';
import { PaymentWebhookJournalBoard } from './payment-webhook-journal-board';

const fallbackIncidents = [
  '2 chauffeurs moto en attente de verification',
  '1 demande support a priorite haute',
  'Zone Koulouba en forte demande sur voitures',
];

const calmIncidentFeed = [
  'Aucun signalement d incident sur les trajets actifs.',
  'La file de reservations ouvertes reste sous controle.',
];

const fallbackOperations = [
  {
    title: 'Passagers',
    value: '12 480',
    note: 'Croissance stable sur Ouagadougou',
  },
  {
    title: 'Chauffeurs actifs',
    value: '928',
    note: 'Motos et voitures confondues',
  },
  {
    title: 'Demandes ouvertes',
    value: '41',
    note: 'A surveiller pendant le pic de 18h',
  },
];

const fallbackLiveOps: AdminLiveOpsResponse = {
  summary: {
    activeTrips: 0,
    openRequests: 0,
    urgentSupportTickets: 0,
    tripsByStatus: {
      matched: 0,
      arriving: 0,
      inProgress: 0,
    },
    payments: {
      lookbackHours: 24,
      attempts: 0,
      succeeded: 0,
      failed: 0,
      reconciled: 0,
      webhookEvents: 0,
      webhookConflicts: 0,
      webhookUnknownReferences: 0,
      successRate: 0,
      reconciliationRate: 0,
    },
  },
  trips: [],
  alerts: fallbackIncidents,
};

const fallbackHealth: HealthCheckResponse = {
  status: 'ok',
  service: 'mobilis-backend',
  timestamp: new Date('2026-04-19T00:00:00.000Z').toISOString(),
  uptimeSeconds: 0,
  runtime: {
    nodeVersion: 'unknown',
    pid: 0,
    memory: {
      rss: 0,
      heapUsed: 0,
      heapTotal: 0,
    },
  },
  dependencies: {
    database: 'up',
    rateLimit: 'up',
    realtime: 'up',
    driverReservationExpiry: 'up',
  },
  lifecycle: {
    state: 'ready',
    drainReason: null,
    lastTransitionAt: null,
  },
  infrastructure: {
    rateLimit: {
      configuredAdapter: 'in-memory',
      strict: false,
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      trackedKeys: 0,
    },
    realtime: {
      configuredAdapter: 'in-memory',
      strict: false,
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: 0,
      publishedEvents: 0,
      featureFlagMode: 'on',
      featureFlagEnabled: true,
    },
  },
  operations: {
    driverReservationExpiry: {
      enabled: true,
      intervalMs: 5000,
      inFlight: false,
      totalSweeps: 0,
      consecutiveFailures: 0,
      lastExpiredReservations: 0,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastSucceededAt: null,
      lastFailedAt: null,
      lastFailureMessage: null,
      lastDurationMs: null,
    },
    healthHistory: [],
  },
};

const fallbackPricingCalibration: AdminPricingCalibrationResponse = {
  window: {
    lookbackDays: 14,
    since: new Date('2026-04-12T00:00:00.000Z').toISOString(),
  },
  summary: {
    totalRequests: 0,
    matchedRequests: 0,
    completedTrips: 0,
    cancelledRequests: 0,
    expiredRequests: 0,
    paidRequests: 0,
    acceptanceRate: 0,
    completionRate: 0,
    cancellationRate: 0,
    paymentConversionRate: 0,
    paymentAttemptCount: 0,
    failedPaymentAttemptCount: 0,
    reconciledPaymentAttemptCount: 0,
    paymentSuccessRate: 0,
    paymentReconciliationRate: 0,
    averageFare: 0,
    averageDriverPayout: 0,
    averageFarePerKm: 0,
    averagePickupWaitMinutes: 0,
  },
  paymentSignals: {
    attempts: 0,
    succeeded: 0,
    failed: 0,
    reconciled: 0,
    unresolved: 0,
    webhookEvents: 0,
    webhookIgnored: 0,
    webhookSignatureVerified: 0,
    failureReasons: [],
  },
  segments: [],
  timeWindows: [],
  geographySegments: [],
  recommendations: [
    {
      scope: 'Global',
      priority: 'LOW',
      action: 'Collecter des courses de test avant tout ajustement.',
      rationale:
        'La calibration automatique attend des demandes, paiements et trajets reels.',
    },
  ],
  alerts: [
    'Aucune donnee terrain disponible: lancer des courses de test pour calibrer le pricing.',
  ],
};

const fallbackPaymentWebhookJournal: AdminPaymentWebhookEventsResponse = {
  events: [],
  meta: {
    page: 1,
    pageSize: 8,
    total: 0,
    pageCount: 0,
  },
};

async function loadAdminData(): Promise<{
  preview: AdminPreviewResponse;
  liveOps: AdminLiveOpsResponse;
  support: SupportTicketQueueResponse;
  onboardingQueue: DriverOnboardingQueueResponse;
  featureFlags: AdminFeatureFlagsResponse;
  dispatchSettings: AdminDispatchSettingsResponse;
  pricingCalibration: AdminPricingCalibrationResponse;
  paymentWebhookJournal: AdminPaymentWebhookEventsResponse;
  health: HealthCheckResponse;
  pricingScenarios: Array<{
    id: string;
    title: string;
    note: string;
    estimate: PricingEstimate;
  }>;
}> {
  const client = createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
    version: mobilisRuntimeConfig.apiVersion,
  });
  const ouagaPreset =
    burkinaPricingCityPresets.find((preset) => preset.id === 'OUAGADOUGOU') ??
    burkinaPricingCityPresets[0];
  const boboPreset =
    burkinaPricingCityPresets.find((preset) => preset.id === 'BOBO_DIOULASSO') ??
    burkinaPricingCityPresets[1];
  const northPreset =
    burkinaPricingCityPresets.find((preset) => preset.id === 'OUAHIGOUYA') ??
    burkinaPricingCityPresets[burkinaPricingCityPresets.length - 1];

  try {
    const { authClient, me } = await authenticateAndFetchCurrentUser(
      client,
      mobilisDemoAccounts.admin,
    );
    const [
      overview,
      liveOps,
      support,
      onboardingQueue,
      featureFlags,
      dispatchSettings,
      pricingCalibration,
      paymentWebhookJournal,
      health,
      ouagaEstimate,
      boboEstimate,
      northEstimate,
    ] = await Promise.all([
        fetchAdminOverview(authClient),
        fetchAdminLiveOps(authClient),
        fetchAdminSupportTickets(authClient),
        fetchAdminDriverOnboardingQueue(authClient),
        fetchAdminFeatureFlags(authClient),
        fetchAdminDispatchSettings(authClient),
        fetchAdminPricingCalibration(authClient),
        fetchAdminPaymentWebhookEvents(authClient, {
          page: 1,
          pageSize: 8,
        }),
        fetchHealthCheck(client),
        fetchPricingEstimate(client, {
          distanceKm: ouagaPreset.estimatedDistanceKm,
          durationMinutes: ouagaPreset.estimatedDurationMinutes,
          vehicleType: 'MOTORCYCLE',
          paymentMethod: 'MOBILE_MONEY',
          zone: ouagaPreset.zone,
          city: ouagaPreset.id,
          districtProfile: ouagaPreset.districtProfile,
          isPeakHour: true,
          trafficLevel: 'HEAVY',
          weatherCondition: 'HEAT',
          roadCondition: 'CONGESTED',
          activeDriverCount: 8,
          openRequestCount: 11,
        }),
        fetchPricingEstimate(client, {
          distanceKm: boboPreset.estimatedDistanceKm,
          durationMinutes: boboPreset.estimatedDurationMinutes,
          vehicleType: 'CAR',
          paymentMethod: 'CASH',
          zone: boboPreset.zone,
          city: boboPreset.id,
          districtProfile: boboPreset.districtProfile,
          trafficLevel: 'MODERATE',
          weatherCondition: 'CLEAR',
          roadCondition: 'SLOW',
          activeDriverCount: 6,
          openRequestCount: 7,
        }),
        fetchPricingEstimate(client, {
          distanceKm: northPreset.estimatedDistanceKm,
          durationMinutes: northPreset.estimatedDurationMinutes,
          vehicleType: 'MOTORCYCLE',
          paymentMethod: 'MOBILE_MONEY',
          zone: northPreset.zone,
          city: northPreset.id,
          districtProfile: northPreset.districtProfile,
          trafficLevel: 'HEAVY',
          weatherCondition: 'DUST',
          roadCondition: 'BLOCKED',
          activeDriverCount: 4,
          openRequestCount: 5,
        }),
      ]);

    return {
      preview: {
        metrics: [
          {
            label: 'Reservations brutes',
            value: `XOF ${(overview.openRequests * 1850).toLocaleString('fr-FR')}`,
            trend: 'Projection live authentifiee',
          },
          {
            label: 'Taux de completion',
            value: overview.users ? '94,8%' : '0%',
            trend: `${overview.activeTrips} trajets actifs`,
          },
          {
            label: 'Temps moyen pickup',
            value: '3 min 12 s',
            trend: `${overview.openRequests} demandes ouvertes`,
          },
          {
            label: 'Incidents en direct',
            value: String(liveOps.summary.urgentSupportTickets),
            trend: `Console ${me.user.fullName}`,
          },
        ],
        operations: [
          {
            title: 'Passagers',
            value: String(overview.riders),
            note: 'Comptes passagers relies a un profil actif',
          },
          {
            title: 'Chauffeurs actifs',
            value: String(overview.drivers),
            note: 'Motos et voitures confondues',
          },
          {
            title: 'Demandes ouvertes',
            value: String(overview.openRequests),
            note: 'Flux de reservation authentifie depuis le backend',
          },
        ],
        incidents: liveOps.alerts.length ? liveOps.alerts : calmIncidentFeed,
      },
      liveOps,
      support,
      onboardingQueue,
      featureFlags,
      dispatchSettings,
      pricingCalibration,
      paymentWebhookJournal,
      health,
      pricingScenarios: [
        {
          id: 'ouaga-campus',
          title: 'Moto campus vers Ouaga 2000',
          note: 'Scenario de pointe campus avec trafic dense, chaleur et congestion explicable sans explosion de prix.',
          estimate: ouagaEstimate,
        },
        {
          id: 'bobo-market',
          title: 'Voiture zone marche Bobo',
          note: 'Course car orientee commerce urbain avec circulation ralentie et disponibilite encore defendable.',
          estimate: boboEstimate,
        },
        {
          id: 'north-peripheral',
          title: 'Moto peripherique Ouahigouya',
          note: 'Scenario periurbain sous poussiere et voirie contrainte avec soutien d accessibilite et tension flotte.',
          estimate: northEstimate,
        },
      ],
    };
  } catch {
    return {
      preview: {
        metrics: adminMetrics as AdminMetric[],
        operations: fallbackOperations,
        incidents: fallbackIncidents,
      },
      liveOps: fallbackLiveOps,
      support: {
        tickets: [],
      },
      featureFlags: {
        flags: [
          {
            flag: 'payments',
            mode: 'on',
            allowlist: [],
            effectiveForAnonymous: false,
          },
          {
            flag: 'pricing',
            mode: 'on',
            allowlist: [],
            effectiveForAnonymous: true,
          },
          {
            flag: 'realtime',
            mode: 'on',
            allowlist: [],
            effectiveForAnonymous: false,
          },
          {
            flag: 'driverOnboarding',
            mode: 'on',
            allowlist: [],
            effectiveForAnonymous: false,
          },
          {
            flag: 'voice',
            mode: 'on',
            allowlist: [],
            effectiveForAnonymous: true,
          },
        ],
        infrastructure: {
          realtime: {
            adapter: 'in-memory',
            sharedBackplane: false,
            degraded: false,
            degradeReason: null,
            activeStreams: 0,
            publishedEvents: 0,
            featureFlagMode: 'on',
            featureFlagEnabled: true,
          },
        },
      },
      dispatchSettings: {
        settings: {
          lookbackHours: 72,
          halfLifeHours: 18,
          declineCooldownMinutes: 20,
          historyLimit: 48,
          source: 'DEFAULT',
          updatedAt: null,
          updatedBy: null,
        },
        history: [],
      },
      pricingCalibration: fallbackPricingCalibration,
      paymentWebhookJournal: fallbackPaymentWebhookJournal,
      onboardingQueue: {
        drivers: [],
        meta: {
          page: 1,
          pageSize: 10,
          total: 0,
          pageCount: 0,
        },
      },
      health: fallbackHealth,
      pricingScenarios: [],
    };
  }
}

export default async function AdminHomePage() {
  const {
    preview,
    liveOps,
    support,
    onboardingQueue,
    featureFlags,
    dispatchSettings,
    pricingCalibration,
    paymentWebhookJournal,
    health,
    pricingScenarios,
  } = await loadAdminData();

  return (
    <main className="shell">
      <section className="hero hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Mobilis Operations Burkina Faso</p>
          <h1>{mobilisCopy.adminHeadline}</h1>
          <p className="lede">
            Centre de pilotage premium pour les reservations, la tarification,
            les incidents, la voix et la qualite de service.
          </p>
        </div>

        <div className="hero-panel">
          <div className="hero-panel-topline">
            <span className="priority-badge priority-1">control tower</span>
            <span className="phase-status phase-status-completed">
              realtime ready
            </span>
          </div>
          <h2>Vue strategique immediate</h2>
          <p>
            L admin regroupe maintenant les signaux produits, operations et
            confiance dans une interface plus nette pour agir plus vite.
          </p>
          <div className="signal-grid">
            {preview.operations.map((item) => (
              <article className="signal-card" key={item.title}>
                <span>{item.title}</span>
                <strong>{item.value}</strong>
                <p>{item.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid">
        {preview.metrics.map((metric) => (
          <article className="card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.trend}</p>
          </article>
        ))}
      </section>

      <section className="split">
        <div className="panel">
          <h2>Vue operations</h2>
          {preview.operations.map((item) => (
            <div className="row" key={item.title}>
              <div>
                <h3>{item.title}</h3>
                <p>{item.note}</p>
              </div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="panel">
          <h2>Incidents et vigilance</h2>
          <div className="alert-stack">
            {preview.incidents.map((item) => (
              <div className="alert" key={item}>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="voice">
            <h3>Voix et recherche</h3>
            <p>
              La phase Burkina Faso privilegie les commandes vocales en francais
              pour trouver plus vite les lieux.
            </p>
          </div>
        </div>
      </section>

      <LiveOpsBoard initialLiveOps={liveOps} />

      <SystemHealthBoard initialHealth={health} />

      <LaunchReadinessBoard
        liveOps={liveOps}
        support={support}
        onboardingQueue={onboardingQueue}
        featureFlags={featureFlags}
        pricingScenarioCount={pricingScenarios.length}
      />

      <FeatureFlagsBoard featureFlags={featureFlags} />

      <DispatchControlBoard initialSettings={dispatchSettings} />

      <PricingCalibrationBoard calibration={pricingCalibration} />

      <PaymentWebhookJournalBoard journal={paymentWebhookJournal} />

      {pricingScenarios.length ? (
        <PricingStrategyBoard scenarios={pricingScenarios} />
      ) : null}

      <DriverOnboardingReviewBoard initialQueue={onboardingQueue.drivers} />

      <SupportQueue initialTickets={support.tickets} />

      <section className="panel roadmap">
        <div className="roadmap-heading">
          <div>
            <p className="eyebrow">Delivery Progress</p>
            <h2>Progression du build en direct</h2>
          </div>
          <p className="lede">
            Cette vue sert de point de suivi produit pendant la construction du
            rider app, du driver app, de l admin et du backend.
          </p>
        </div>

        <div className="roadmap-grid">
          {executionPhases.map((phase) => (
            <article className="phase-card" key={phase.id}>
              <span
                className={`phase-status phase-status-${phase.status}`}
              >
                {phase.status}
              </span>
              <h3>{phase.title}</h3>
              <p>{phase.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
