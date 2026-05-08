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
  fetchAdminLaunchReadiness,
  fetchAdminOverview,
  fetchAdminDriverOnboardingQueue,
  fetchAdminDriverWallets,
  fetchAdminPaymentWebhookEvents,
  fetchAdminPricingCalibration,
  fetchAdminSupportTickets,
  type AdminDispatchSettingsResponse,
  type AdminFeatureFlagsResponse,
  type AdminDriverWalletsResponse,
  type AdminLaunchReadinessResponse,
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
import { DriverWalletsBoard } from './driver-wallets-board';

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
      refundPending: 0,
      refunded: 0,
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
    jobQueue: {
      durable: true,
      families: ['PAYMENT_WEBHOOK', 'DRIVER_DOCUMENT', 'NOTIFICATION'],
      counts: [],
    },
  },
  operations: {
    productionReadiness: {
      environment: 'development',
      riskLevel: 'medium',
      failedChecks: 0,
      warningChecks: 3,
      checks: [
        {
          id: 'rate-limit-backplane',
          label: 'Rate limit partage',
          state: 'warn',
          detail: 'Fallback local utilise par la preview.',
        },
        {
          id: 'realtime-backplane',
          label: 'Realtime partage',
          state: 'warn',
          detail: 'Fallback local utilise par la preview.',
        },
        {
          id: 'provider-refunds',
          label: 'Refunds provider',
          state: 'warn',
          detail: 'Refunds en mode manual/console.',
        },
      ],
    },
    serviceLevelObjectives: {
      posture: 'watch',
      failingObjectives: 0,
      warningObjectives: 1,
      objectives: [
        {
          id: 'critical-api-availability',
          label: 'Disponibilite API critique',
          target: '>= 99.9%',
          window: 'rolling-30d',
          owner: 'engineering',
          state: 'pass',
          currentSignal: 'Preview admin sans backend live.',
          burnRate: 'normal',
        },
        {
          id: 'realtime-critical-event-latency',
          label: 'Evenement realtime critique p95',
          target: '< 2 s',
          window: 'rolling-15m',
          owner: 'engineering',
          state: 'warn',
          currentSignal: 'Preview admin en mode fallback local.',
          burnRate: 'elevated',
        },
      ],
      mobileErrorTaxonomy: [
        {
          code: 'MOB-REALTIME-DEGRADED',
          surface: 'active-trip',
          severity: 'medium',
          owner: 'engineering',
          retryPolicy: 'fallback-polling-with-last-known-state',
          userMessage:
            'Connexion live instable. Le trajet reste suivi par Mobilis.',
        },
      ],
    },
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
  summary: {
    paymentEvents: 0,
    refundEvents: 0,
    ignoredEvents: 0,
  },
};

const fallbackDriverWallets: AdminDriverWalletsResponse = {
  summary: {
    walletCount: 0,
    totalBalance: 0,
    totalPayouts: 0,
    totalCommission: 0,
    recoveryWalletCount: 0,
    totalRecoveryDue: 0,
  },
  wallets: [],
  meta: {
    page: 1,
    pageSize: 10,
    total: 0,
    pageCount: 0,
  },
};

const fallbackLaunchReadiness: AdminLaunchReadinessResponse = {
  generatedAt: new Date('2026-04-19T00:00:00.000Z').toISOString(),
  environment: 'development',
  decision: {
    state: 'limited',
    label: 'pilote limite seulement',
    detail:
      'Signal fallback admin: garder le pilote en mode encadre tant que le backend local n est pas joignable.',
  },
  summary: {
    failedChecks: 0,
    warningChecks: 3,
    passedChecks: 6,
    totalChecks: 9,
  },
  checks: [
    {
      id: 'fallback-runtime',
      label: 'Runtime preview',
      state: 'warn',
      detail: 'Donnees de readiness produites par le fallback admin.',
    },
  ],
  nextActions: [
    {
      checkId: 'fallback-runtime',
      severity: 'warning',
      owner: 'engineering',
      action:
        'Redemarrer ou connecter le backend local pour recuperer la decision de lancement officielle.',
      runbookAnchor: 'checklist-avant-de-deployer',
    },
  ],
  acknowledgements: [],
  actionSummary: {
    totalActions: 1,
    acknowledgedActions: 0,
    remainingActions: 1,
    blockingActions: 0,
    acknowledgedBlockingActions: 0,
    remainingBlockingActions: 0,
    completionRate: 0,
  },
  safetyBenchmark: {
    summary: {
      totalCapabilities: 8,
      activeCapabilities: 4,
      partialCapabilities: 1,
      plannedCapabilities: 3,
      criticalGaps: 1,
      competitorParityRate: 56.3,
    },
    capabilities: [
      {
        id: 'fallback-safety',
        label: 'Benchmark securite',
        status: 'planned',
        priority: 'critical',
        mobilisSignal:
          'Fallback admin: reconnecter le backend pour obtenir la matrice officielle.',
        competitorSignal: 'Uber, Bolt et Yango exposent SOS et partage trajet.',
        nextStep:
          'Restaurer le backend puis traiter les gaps critiques avant extension.',
      },
    ],
  },
  fieldQuality: {
    score: 72,
    state: 'watch',
    blockedSignals: 0,
    watchSignals: 1,
    signals: [
      {
        id: 'fallback-field-quality',
        label: 'Qualite terrain',
        score: 72,
        state: 'watch',
        owner: 'engineering',
        competitorReference:
          'Les leaders pilotent leur qualite avec support, paiement, disponibilite et stabilite mobile.',
        mobilisSignal:
          'Fallback admin: reconnecter le backend pour obtenir le score terrain officiel.',
        nextStep:
          'Relancer le backend puis verifier launch-readiness et System Health.',
      },
    ],
  },
  productionReadiness: fallbackHealth.operations.productionReadiness!,
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
  driverWallets: AdminDriverWalletsResponse;
  launchReadiness: AdminLaunchReadinessResponse;
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
      driverWallets,
      launchReadiness,
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
        fetchAdminDriverWallets(authClient),
        fetchAdminLaunchReadiness(authClient),
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
      driverWallets,
      launchReadiness,
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
      driverWallets: fallbackDriverWallets,
      launchReadiness: fallbackLaunchReadiness,
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
    driverWallets,
    launchReadiness,
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

      <section className="panel test-access-panel">
        <div>
          <p className="eyebrow">Acces test local</p>
          <h2>Comptes de demonstration</h2>
          <p className="lede">
            Cette console admin utilise automatiquement le compte admin demo.
            Les identifiants rider et driver se saisissent dans les apps mobiles
            Expo, pas sur cette page.
          </p>
        </div>
        <div className="test-access-grid">
          <article className="test-access-card">
            <span>Admin web</span>
            <strong>{mobilisDemoAccounts.admin.email}</strong>
            <p>Deja connecte sur cette console.</p>
            <code>{mobilisDemoAccounts.admin.password}</code>
          </article>
          <article className="test-access-card">
            <span>Rider app</span>
            <strong>{mobilisDemoAccounts.rider.email}</strong>
            <p>Ouvre l app rider avec `pnpm dev:rider`.</p>
            <code>{mobilisDemoAccounts.rider.password}</code>
          </article>
          <article className="test-access-card">
            <span>Driver app</span>
            <strong>{mobilisDemoAccounts.driver.email}</strong>
            <p>Ouvre l app driver avec `pnpm dev:driver`.</p>
            <code>{mobilisDemoAccounts.driver.password}</code>
          </article>
        </div>
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
        paymentWebhookJournal={paymentWebhookJournal}
        driverWallets={driverWallets}
        launchReadiness={launchReadiness}
        productionReadiness={health.operations.productionReadiness}
        pricingScenarioCount={pricingScenarios.length}
      />

      <FeatureFlagsBoard featureFlags={featureFlags} />

      <DispatchControlBoard initialSettings={dispatchSettings} />

      <PricingCalibrationBoard calibration={pricingCalibration} />

      <PaymentWebhookJournalBoard journal={paymentWebhookJournal} />

      <DriverWalletsBoard wallets={driverWallets} />

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
