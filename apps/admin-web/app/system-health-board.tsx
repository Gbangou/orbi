'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AdminJobQueueResponse,
  type HealthCheckResponse,
} from '@orbi/api';
import { describeRealtimeConnection } from '@orbi/ui';
import {
  adminSyncHighlightDurationMs,
  canAttemptJobRequeue,
  formatAdminDateTime,
  type JobQueueKindFilter,
  resolveHealthTransitionLabel,
  resolveJobQueueFilterSummary,
  resolveJobQueueOwnerRows,
} from './admin-ops-kernel';
import {
  createAdminMutationHeaders,
  fetchAdminJson,
} from './admin-client-fetch';
import { subscribeToAdminRealtime } from './admin-realtime';

type SystemHealthBoardProps = {
  initialHealth: HealthCheckResponse;
};

type HealthHistoryEntry =
  HealthCheckResponse['operations']['healthHistory'][number];
type HealthAuditEvent = {
  id: string;
  tone: 'alert' | 'recovered' | 'acknowledged' | 'muted';
  title: string;
  detail: string;
  createdAt: string;
};
type AdminJobQueueEntry = AdminJobQueueResponse['jobs'][number];
type HealthAuditFilter = 'all' | 'incidents' | 'recoveries' | 'human-actions';
type JobQueueStatusFilter =
  | 'ALL'
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'DEAD_LETTER';

const healthAuditFilters: Array<{
  id: HealthAuditFilter;
  label: string;
  description: string;
}> = [
  {
    id: 'all',
    label: 'Tout le flux',
    description: 'Sequence complete des alertes, actions ops et recoveries.',
  },
  {
    id: 'incidents',
    label: 'Incidents seulement',
    description: 'Alertes systeme qui demandent une lecture immediate.',
  },
  {
    id: 'recoveries',
    label: 'Recoveries',
    description: 'Retours a la normale publies par le backend.',
  },
  {
    id: 'human-actions',
    label: 'Actions humaines',
    description: 'Accuses reception et masquages realises par les ops.',
  },
];

const jobQueueKindFilters: Array<{
  id: JobQueueKindFilter;
  label: string;
}> = [
  { id: 'ALL', label: 'Toutes familles' },
  { id: 'PAYMENT_WEBHOOK', label: 'Paiements' },
  { id: 'PAYMENT_REFUND_VERIFICATION', label: 'Refunds' },
  { id: 'DRIVER_DOCUMENT', label: 'Documents' },
  { id: 'NOTIFICATION', label: 'Notifications' },
  { id: 'DRIVER_RESERVATION_EXPIRY', label: 'Reservations' },
];

const jobQueueStatusFilters: Array<{
  id: JobQueueStatusFilter;
  label: string;
}> = [
  { id: 'DEAD_LETTER', label: 'Dead-letter' },
  { id: 'PENDING', label: 'En attente' },
  { id: 'RUNNING', label: 'En cours' },
  { id: 'SUCCEEDED', label: 'Traites' },
  { id: 'ALL', label: 'Tous statuts' },
];

function describeOverallHealth(status: HealthCheckResponse['status']) {
  return status === 'ok' ? 'stable' : 'degrade';
}

function describeDependencyState(state: string) {
  if (state === 'up') {
    return 'ok';
  }

  if (state === 'disabled') {
    return 'desactive';
  }

  if (state === 'down') {
    return 'hors service';
  }

  return 'degrade';
}

function readinessTone(state: string) {
  if (state === 'up' || state === 'ok' || state === 'pass' || state === 'low') {
    return 'good';
  }

  if (state === 'disabled' || state === 'warn' || state === 'medium') {
    return 'warn';
  }

  return 'bad';
}

function describeProductionRisk(riskLevel: string) {
  if (riskLevel === 'low') {
    return 'faible';
  }

  if (riskLevel === 'medium') {
    return 'moyen';
  }

  return 'eleve';
}

function describeSloPosture(posture: string) {
  if (posture === 'healthy') {
    return 'tenus';
  }

  if (posture === 'watch') {
    return 'sous surveillance';
  }

  return 'breach';
}

function describeJobKind(kind: string) {
  if (kind === 'PAYMENT_WEBHOOK') {
    return 'Webhooks paiement';
  }

  if (kind === 'PAYMENT_REFUND_VERIFICATION') {
    return 'Refunds paiement';
  }

  if (kind === 'DRIVER_DOCUMENT') {
    return 'Documents chauffeur';
  }

  if (kind === 'DRIVER_RESERVATION_EXPIRY') {
    return 'Reservations chauffeur';
  }

  return 'Notifications';
}

function describeJobStatus(status: string) {
  if (status === 'PENDING') {
    return 'en attente';
  }

  if (status === 'RUNNING') {
    return 'en cours';
  }

  if (status === 'SUCCEEDED') {
    return 'traites';
  }

  return 'dead-letter';
}

function resolveJobStatusTone(status: string) {
  if (status === 'DEAD_LETTER') {
    return 'bad';
  }

  if (status === 'PENDING' || status === 'RUNNING') {
    return 'warn';
  }

  return 'good';
}

function resolveJobSeverityTone(severity: string) {
  if (severity === 'critical' || severity === 'high') {
    return 'bad';
  }

  if (severity === 'medium') {
    return 'warn';
  }

  return 'good';
}

function buildRequeueConfirmation(job: AdminJobQueueEntry) {
  const base = `Remettre en file ${describeJobKind(job.kind)} (${job.entityType ?? 'entity'}:${job.entityId ?? 'non-reference'}) ?`;

  if (job.kind === 'PAYMENT_WEBHOOK') {
    return `${base}\n\nVerifier avant de continuer: signature, reference provider, montant/devise et idempotence finance.`;
  }

  if (job.kind === 'PAYMENT_REFUND_VERIFICATION') {
    return `${base}\n\nVerifier avant de continuer: statut provider du remboursement, tentative paiement et solde wallet.`;
  }

  if (job.kind === 'DRIVER_DOCUMENT') {
    return `${base}\n\nVerifier avant de continuer: raison de quarantaine KYC, preuve objet provider et decision onboarding non approuvee.`;
  }

  if (job.kind === 'DRIVER_RESERVATION_EXPIRY') {
    return `${base}\n\nVerifier avant de continuer: worker durable actif, dispatch sain et absence de backlog reservation.`;
  }

  return `${base}\n\nVerifier avant de continuer: provider notification configure et absence de double envoi visible.`;
}

function describeReadinessCheckState(state: string) {
  if (state === 'pass') {
    return 'ok';
  }

  if (state === 'warn') {
    return 'attention';
  }

  return 'bloquant';
}

function formatTimestamp(value: string | null) {
  return formatAdminDateTime(value, 'Aucun signal', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeHealthDetail(snapshot: HealthCheckResponse) {
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

function buildHealthAuditTrail(
  history: HealthHistoryEntry[],
): HealthAuditEvent[] {
  return history
    .flatMap((entry) => {
      const events: HealthAuditEvent[] = [
        {
          id: `${entry.id}:created`,
          tone: entry.tone,
          title: entry.tone === 'alert' ? 'Alerte publiee' : 'Recovery publie',
          detail: entry.detail,
          createdAt: entry.createdAt,
        },
      ];

      if (entry.acknowledgedAt && entry.acknowledgedBy) {
        events.push({
          id: `${entry.id}:acknowledged`,
          tone: 'acknowledged',
          title: 'Incident reconnu',
          detail: `${entry.acknowledgedBy.fullName} (${entry.acknowledgedBy.role}) a accuse reception de l incident.`,
          createdAt: entry.acknowledgedAt,
        });
      }

      if (entry.mutedAt && entry.mutedBy) {
        events.push({
          id: `${entry.id}:muted`,
          tone: 'muted',
          title: 'Incident masque',
          detail: `${entry.mutedBy.fullName} (${entry.mutedBy.role}) a retire cet incident de la vue active.`,
          createdAt: entry.mutedAt,
        });
      }

      return events;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function describeAuditTone(tone: HealthAuditEvent['tone']) {
  if (tone === 'alert') {
    return 'incident';
  }

  if (tone === 'recovered') {
    return 'retabli';
  }

  if (tone === 'acknowledged') {
    return 'vu';
  }

  return 'masque';
}

function resolveAuditToneClass(tone: HealthAuditEvent['tone']) {
  if (tone === 'recovered' || tone === 'acknowledged') {
    return 'good';
  }

  if (tone === 'muted') {
    return 'warn';
  }

  return 'bad';
}

function matchesAuditFilter(
  event: HealthAuditEvent,
  filter: HealthAuditFilter,
) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'incidents') {
    return event.tone === 'alert';
  }

  if (filter === 'recoveries') {
    return event.tone === 'recovered';
  }

  return event.tone === 'acknowledged' || event.tone === 'muted';
}

async function fetchSystemHealth() {
  return fetchAdminJson<HealthCheckResponse>('/api/admin/health');
}

async function fetchAdminJobQueueFromServer(input: {
  kind: JobQueueKindFilter;
  status: JobQueueStatusFilter;
}) {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '6',
  });

  if (input.kind !== 'ALL') {
    params.set('kind', input.kind);
  }

  if (input.status !== 'ALL') {
    params.set('status', input.status);
  }

  return fetchAdminJson<AdminJobQueueResponse>(
    `/api/admin/job-queue?${params.toString()}`,
  );
}

export function SystemHealthBoard({ initialHealth }: SystemHealthBoardProps) {
  const [health, setHealth] = useState(initialHealth);
  const [status, setStatus] = useState('Health watchdog synchronise.');
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [history, setHistory] = useState<HealthHistoryEntry[]>(
    initialHealth.operations.healthHistory,
  );
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const incidentActionInFlightRef = useRef(new Set<string>());
  const jobActionInFlightRef = useRef(new Set<string>());
  const [jobQueueDetails, setJobQueueDetails] =
    useState<AdminJobQueueResponse | null>(null);
  const [jobQueueStatus, setJobQueueStatus] = useState(
    'Journal dead-letter en attente.',
  );
  const [jobQueueKindFilter, setJobQueueKindFilter] =
    useState<JobQueueKindFilter>('ALL');
  const [jobQueueStateFilter, setJobQueueStateFilter] =
    useState<JobQueueStatusFilter>('DEAD_LETTER');
  const [auditFilter, setAuditFilter] = useState<HealthAuditFilter>('all');
  const previousHealthRef = useRef<HealthCheckResponse | null>(null);
  const productionReadiness = health.operations.productionReadiness ?? {
    environment: 'unknown',
    riskLevel: 'medium' as const,
    failedChecks: 0,
    warningChecks: 1,
    checks: [
      {
        id: 'production-readiness-unavailable',
        label: 'Readiness production',
        state: 'warn' as const,
        detail:
          'Le backend courant ne fournit pas encore le resume production readiness.',
      },
    ],
  };
  const resilienceChecks = productionReadiness.checks.filter((check) =>
    [
      'database-backup-restore-drill',
      'pilot-capacity-envelope',
      'canary-release-drill',
      'chaos-drain-drill',
    ].includes(check.id),
  );
  const resilienceState = resilienceChecks.some((check) => check.state === 'fail')
    ? 'fail'
    : resilienceChecks.some((check) => check.state === 'warn')
    ? 'warn'
    : 'pass';
  const complianceChecks = productionReadiness.checks.filter((check) =>
    [
      'legal-terms-version',
      'privacy-policy-version',
      'insurance-policy-reference',
    ].includes(check.id),
  );
  const complianceState = complianceChecks.some((check) => check.state === 'fail')
    ? 'fail'
    : complianceChecks.some((check) => check.state === 'warn')
      ? 'warn'
      : 'pass';
  const serviceLevelObjectives = health.operations.serviceLevelObjectives ?? {
    posture: 'watch' as const,
    failingObjectives: 0,
    warningObjectives: 1,
    objectives: [
      {
        id: 'slo-unavailable',
        label: 'SLO runtime',
        target: 'dashboard backend requis',
        window: 'current',
        owner: 'engineering' as const,
        state: 'warn' as const,
        currentSignal:
          'Le backend courant ne fournit pas encore les objectifs de service.',
        burnRate: 'elevated' as const,
      },
    ],
    mobileErrorTaxonomy: [
      {
        code: 'MOB-RUNTIME-UNKNOWN',
        surface: 'mobile',
        severity: 'medium' as const,
        owner: 'engineering' as const,
        retryPolicy: 'refresh-health-before-triage',
        userMessage:
          'Etat runtime indisponible. Les ops doivent resynchroniser le backend.',
      },
    ],
  };
  const jobQueue = health.infrastructure.jobQueue ?? {
    durable: false,
    families: [
      'PAYMENT_WEBHOOK',
      'PAYMENT_REFUND_VERIFICATION',
      'DRIVER_DOCUMENT',
      'NOTIFICATION',
      'DRIVER_RESERVATION_EXPIRY',
    ] as const,
    counts: [],
  };

  const refreshHealth = useCallback(
    async (message = 'Sante systeme resynchronisee.') => {
      try {
        const response = await fetchSystemHealth();
        setHealth(response);
        setHistory(response.operations.healthHistory);
        setStatus(message);
      } catch {
        setStatus("Impossible d'actualiser la sante systeme.");
      }
    },
    [],
  );

  const refreshJobQueue = useCallback(async () => {
    try {
      const response = await fetchAdminJobQueueFromServer({
        kind: jobQueueKindFilter,
        status: jobQueueStateFilter,
      });

      setJobQueueDetails(response);
      setJobQueueStatus(
        response.jobs.length
          ? `${response.jobs.length} job(s) a qualifier.`
          : 'Aucun job pour ce filtre operations.',
      );
    } catch {
      setJobQueueStatus("Impossible d'actualiser le journal de jobs.");
    }
  }, [jobQueueKindFilter, jobQueueStateFilter]);

  const visibleHistory = useMemo(
    () => history.filter((entry) => !entry.mutedAt),
    [history],
  );
  const unseenCount = useMemo(
    () =>
      visibleHistory.filter(
        (entry) => entry.tone === 'alert' && !entry.acknowledgedAt,
      ).length,
    [visibleHistory],
  );
  const auditTrail = useMemo(
    () => buildHealthAuditTrail(history).slice(0, 8),
    [history],
  );
  const filteredAuditTrail = useMemo(
    () => auditTrail.filter((event) => matchesAuditFilter(event, auditFilter)),
    [auditFilter, auditTrail],
  );
  const auditCounts = useMemo(
    () => ({
      all: auditTrail.length,
      incidents: auditTrail.filter((event) => event.tone === 'alert').length,
      recoveries: auditTrail.filter((event) => event.tone === 'recovered')
        .length,
      'human-actions': auditTrail.filter(
        (event) => event.tone === 'acknowledged' || event.tone === 'muted',
      ).length,
    }),
    [auditTrail],
  );
  const activeAuditFilter = useMemo(
    () =>
      healthAuditFilters.find((filter) => filter.id === auditFilter) ??
      healthAuditFilters[0],
    [auditFilter],
  );
  const jobQueueTotals = useMemo(() => {
    const total = jobQueue.counts.reduce((sum, entry) => sum + entry.count, 0);
    const deadLetter = jobQueue.counts
      .filter((entry) => entry.status === 'DEAD_LETTER')
      .reduce((sum, entry) => sum + entry.count, 0);
    const active = jobQueue.counts
      .filter(
        (entry) => entry.status === 'PENDING' || entry.status === 'RUNNING',
      )
      .reduce((sum, entry) => sum + entry.count, 0);

    return {
      total,
      active,
      deadLetter,
    };
  }, [jobQueue.counts]);
  const jobQueueRows = useMemo(
    () =>
      jobQueue.families.map((family) => {
        const counts = jobQueue.counts.filter((entry) => entry.kind === family);
        const total = counts.reduce((sum, entry) => sum + entry.count, 0);
        const deadLetter = counts
          .filter((entry) => entry.status === 'DEAD_LETTER')
          .reduce((sum, entry) => sum + entry.count, 0);
        const pending = counts
          .filter((entry) => entry.status === 'PENDING')
          .reduce((sum, entry) => sum + entry.count, 0);
        const running = counts
          .filter((entry) => entry.status === 'RUNNING')
          .reduce((sum, entry) => sum + entry.count, 0);

        return {
          family,
          counts,
          total,
          deadLetter,
          pending,
          running,
        };
      }),
    [jobQueue.counts, jobQueue.families],
  );
  const jobQueueFilterSummary = useMemo(() => {
    const jobs = jobQueueDetails?.jobs ?? [];
    return resolveJobQueueFilterSummary(jobs, jobQueueKindFilter);
  }, [jobQueueDetails?.jobs, jobQueueKindFilter]);
  const jobQueueOwnerRows = useMemo(() => {
    const jobs = jobQueueDetails?.jobs ?? [];
    return resolveJobQueueOwnerRows(jobs);
  }, [jobQueueDetails?.jobs]);

  const acknowledgeIncident = useCallback(
    async (incidentId: string) => {
      if (incidentActionInFlightRef.current.has(incidentId)) {
        return;
      }

      incidentActionInFlightRef.current.add(incidentId);
      try {
        setActiveIncidentId(incidentId);

        await fetchAdminJson(
          `/api/admin/health-incidents/${encodeURIComponent(
            incidentId,
          )}/acknowledge`,
          { method: 'PATCH', headers: createAdminMutationHeaders() },
        );
        await refreshHealth('Incident health reconnu par les operations.');
      } catch {
        setStatus("Impossible de marquer l'incident comme vu.");
      } finally {
        incidentActionInFlightRef.current.delete(incidentId);
        setActiveIncidentId(null);
      }
    },
    [refreshHealth],
  );

  const muteIncident = useCallback(
    async (incidentId: string) => {
      if (incidentActionInFlightRef.current.has(incidentId)) {
        return;
      }

      incidentActionInFlightRef.current.add(incidentId);
      try {
        setActiveIncidentId(incidentId);

        await fetchAdminJson(
          `/api/admin/health-incidents/${encodeURIComponent(incidentId)}/mute`,
          { method: 'PATCH', headers: createAdminMutationHeaders() },
        );
        await refreshHealth(
          'Incident health masque pour toutes les consoles ops.',
        );
      } catch {
        setStatus("Impossible de masquer l'incident.");
      } finally {
        incidentActionInFlightRef.current.delete(incidentId);
        setActiveIncidentId(null);
      }
    },
    [refreshHealth],
  );

  const requeueJob = useCallback(
    async (job: AdminJobQueueEntry) => {
      if (job.status !== 'DEAD_LETTER') {
        setJobQueueStatus(
          'Seuls les jobs dead-letter peuvent etre remis en file.',
        );
        return;
      }

      if (!window.confirm(buildRequeueConfirmation(job))) {
        return;
      }

      if (jobActionInFlightRef.current.has(job.id)) {
        return;
      }

      jobActionInFlightRef.current.add(job.id);
      try {
        setActiveJobId(job.id);

        await fetchAdminJson(
          `/api/admin/job-queue/${encodeURIComponent(job.id)}/requeue`,
          { method: 'POST', headers: createAdminMutationHeaders() },
        );
        await refreshHealth('Job dead-letter remis en file.');
        await refreshJobQueue();
      } catch {
        setJobQueueStatus('Impossible de remettre ce job en file.');
      } finally {
        jobActionInFlightRef.current.delete(job.id);
        setActiveJobId(null);
      }
    },
    [refreshHealth, refreshJobQueue],
  );

  useEffect(() => {
    const stream = subscribeToAdminRealtime({
      'system.health-alert': () =>
        void refreshHealth('Alerte health recue en temps reel.'),
      'system.health-recovered': () =>
        void refreshHealth('Sante systeme retablie en temps reel.'),
      'system.health-incident-acknowledged': () =>
        void refreshHealth(
          'Un incident health vient d etre reconnu par une autre console.',
        ),
      'system.health-incident-muted': () =>
        void refreshHealth(
          'Un incident health vient d etre masque par une autre console.',
        ),
      'job-queue.requeued': () => {
        void refreshHealth('Job queue resynchronisee.');
        void refreshJobQueue();
      },
      heartbeat: () =>
        setStatus(describeRealtimeConnection('admin-health', 'active')),
    });

    stream.onopen = () => {
      setStatus(describeRealtimeConnection('admin-health', 'connected'));
    };

    stream.onerror = () => {
      setStatus(describeRealtimeConnection('admin-health', 'reconnecting'));
    };

    return () => stream.close();
  }, [refreshHealth, refreshJobQueue]);

  useEffect(() => {
    void refreshJobQueue();
  }, [refreshJobQueue]);

  useEffect(() => {
    const previousHealth = previousHealthRef.current;
    const nextTransitionLabel = resolveHealthTransitionLabel(
      previousHealth,
      health,
    );

    if (nextTransitionLabel) {
      setTransitionLabel(nextTransitionLabel);
    }

    previousHealthRef.current = health;
  }, [health]);

  useEffect(() => {
    if (!transitionLabel) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransitionLabel(null);
    }, adminSyncHighlightDurationMs);

    return () => window.clearTimeout(timeout);
  }, [transitionLabel]);

  return (
    <section className="panel system-health-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">System Health</p>
          <h2>Watchdog infra et incidents automatisees</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Le dashboard operations suit maintenant l etat du backend, du
            realtime et du sweeper reservations avec alertes live et signal de
            reprise.
          </p>
          <div className="queue-actions">
            <button
              className="ghost-button"
              onClick={() => void refreshHealth()}
              type="button"
            >
              Actualiser
            </button>
            <span className="queue-status">{status}</span>
            {transitionLabel ? (
              <span className="queue-transition">{transitionLabel}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>Backend</span>
          <strong>{describeOverallHealth(health.status)}</strong>
          <p>Etat global retourne par /health</p>
        </article>
        <article className="board-summary-card">
          <span>Realtime</span>
          <strong>
            {describeDependencyState(health.dependencies.realtime)}
          </strong>
          <p>
            {health.infrastructure.realtime.activeStreams} flux,{' '}
            {health.infrastructure.realtime.publishedEvents} evenements
          </p>
        </article>
        <article className="board-summary-card">
          <span>Sweeper reservations</span>
          <strong>
            {describeDependencyState(
              health.dependencies.driverReservationExpiry,
            )}
          </strong>
          <p>
            {health.operations.driverReservationExpiry.totalSweeps} sweeps,{' '}
            {health.operations.driverReservationExpiry.consecutiveFailures}{' '}
            echec(s) consecutif(s)
          </p>
        </article>
        <article className="board-summary-card">
          <span>Historique recent</span>
          <strong>{visibleHistory.length}</strong>
          <p>Historique recent fourni par le backend et complete en live</p>
        </article>
        <article className="board-summary-card">
          <span>Incidents neufs</span>
          <strong>{unseenCount}</strong>
          <p>Alertes non reconnues par cette console ops</p>
        </article>
        <article className="board-summary-card">
          <span>Risque production</span>
          <strong>
            {describeProductionRisk(productionReadiness.riskLevel)}
          </strong>
          <p>
            {productionReadiness.failedChecks} bloquant(s),{' '}
            {productionReadiness.warningChecks} attention(s)
          </p>
        </article>
        <article className="board-summary-card">
          <span>SLO production</span>
          <strong>{describeSloPosture(serviceLevelObjectives.posture)}</strong>
          <p>
            {serviceLevelObjectives.failingObjectives} breach(s),{' '}
            {serviceLevelObjectives.warningObjectives} watch
          </p>
        </article>
        <article className="board-summary-card">
          <span>Queue durable</span>
          <strong>{jobQueueTotals.active}</strong>
          <p>
            {jobQueueTotals.deadLetter} dead-letter, {jobQueueTotals.total}{' '}
            job(s) suivis
          </p>
        </article>
      </div>

      <div className="health-grid">
        <article className="feature-runtime-card health-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-1">etat global</span>
            <span
              className={`readiness-pill readiness-pill-${readinessTone(
                health.status,
              )}`}
            >
              {describeOverallHealth(health.status)}
            </span>
          </div>
          <div className="health-dependency-list">
            <div className="health-dependency-row">
              <div>
                <strong>Base de donnees</strong>
                <p>Verification heartbeat SQL et disponibilite backend.</p>
              </div>
              <span
                className={`readiness-pill readiness-pill-${readinessTone(
                  health.dependencies.database,
                )}`}
              >
                {describeDependencyState(health.dependencies.database)}
              </span>
            </div>
            <div className="health-dependency-row">
              <div>
                <strong>Rate limit</strong>
                <p>Store anti-abus et mode strict observables.</p>
              </div>
              <span
                className={`readiness-pill readiness-pill-${readinessTone(
                  health.dependencies.rateLimit,
                )}`}
              >
                {describeDependencyState(health.dependencies.rateLimit)}
              </span>
            </div>
            <div className="health-dependency-row">
              <div>
                <strong>Realtime</strong>
                <p>
                  Adapter actif, backplane et degradation du transport live.
                </p>
              </div>
              <span
                className={`readiness-pill readiness-pill-${readinessTone(
                  health.dependencies.realtime,
                )}`}
              >
                {describeDependencyState(health.dependencies.realtime)}
              </span>
            </div>
            <div className="health-dependency-row">
              <div>
                <strong>Sweeper reservations</strong>
                <p>Surveillance de silence, echecs consecutifs et reprise.</p>
              </div>
              <span
                className={`readiness-pill readiness-pill-${readinessTone(
                  health.dependencies.driverReservationExpiry,
                )}`}
              >
                {describeDependencyState(
                  health.dependencies.driverReservationExpiry,
                )}
              </span>
            </div>
          </div>
        </article>

        <article className="feature-runtime-card health-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-1">prod readiness</span>
            <span
              className={`readiness-pill readiness-pill-${readinessTone(
                productionReadiness.riskLevel,
              )}`}
            >
              {describeProductionRisk(productionReadiness.riskLevel)}
            </span>
          </div>
          <div className="health-dependency-list">
            {productionReadiness.checks.map((check) => (
              <div className="health-dependency-row" key={check.id}>
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
                <span
                  className={`readiness-pill readiness-pill-${readinessTone(
                    check.state,
                  )}`}
                >
                  {describeReadinessCheckState(check.state)}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="feature-runtime-card health-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-2">resilience pilote</span>
            <span
              className={`readiness-pill readiness-pill-${readinessTone(
                resilienceState,
              )}`}
            >
              {describeReadinessCheckState(resilienceState)}
            </span>
          </div>
          <div className="health-dependency-list">
            {resilienceChecks.length ? (
              resilienceChecks.map((check) => (
                <div className="health-dependency-row" key={check.id}>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                  <span
                    className={`readiness-pill readiness-pill-${readinessTone(
                      check.state,
                    )}`}
                  >
                    {describeReadinessCheckState(check.state)}
                  </span>
                </div>
              ))
            ) : (
              <div className="health-dependency-row">
                <div>
                  <strong>Preuves resilience</strong>
                  <p>
                    Le backend courant ne fournit pas encore les checks restore
                    DB et capacite pilote.
                  </p>
                </div>
                <span className="readiness-pill readiness-pill-warn">
                  Attention
                </span>
              </div>
            )}
          </div>
        </article>

        <article className="feature-runtime-card health-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-2">conformite pilote</span>
            <span
              className={`readiness-pill readiness-pill-${readinessTone(
                complianceState,
              )}`}
            >
              {describeReadinessCheckState(complianceState)}
            </span>
          </div>
          <div className="health-dependency-list">
            {complianceChecks.length ? (
              complianceChecks.map((check) => (
                <div className="health-dependency-row" key={check.id}>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                  <span
                    className={`readiness-pill readiness-pill-${readinessTone(
                      check.state,
                    )}`}
                  >
                    {describeReadinessCheckState(check.state)}
                  </span>
                </div>
              ))
            ) : (
              <div className="health-dependency-row">
                <div>
                  <strong>Preuves conformite</strong>
                  <p>
                    Le backend courant ne fournit pas encore les checks CGU,
                    confidentialite et assurance.
                  </p>
                </div>
                <span className="readiness-pill readiness-pill-warn">
                  Attention
                </span>
              </div>
            )}
          </div>
        </article>

        <article className="feature-runtime-card health-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-2">signals ops</span>
            <span className="phase-status phase-status-next">
              {health.infrastructure.realtime.adapter}
            </span>
          </div>
          <div className="feature-flag-rows">
            <div className="pricing-row">
              <span>Realtime reason</span>
              <strong>
                {health.infrastructure.realtime.degradeReason ?? 'Aucune'}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Realtime flag</span>
              <strong>
                {health.infrastructure.realtime.featureFlagMode ?? 'n/a'}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Dernier succes sweeper</span>
              <strong>
                {formatTimestamp(
                  health.operations.driverReservationExpiry.lastSucceededAt,
                )}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Dernier echec sweeper</span>
              <strong>
                {formatTimestamp(
                  health.operations.driverReservationExpiry.lastFailedAt,
                )}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Duree dernier run</span>
              <strong>
                {health.operations.driverReservationExpiry.lastDurationMs !==
                null
                  ? `${health.operations.driverReservationExpiry.lastDurationMs} ms`
                  : 'n/a'}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Reservations expirees</span>
              <strong>
                {
                  health.operations.driverReservationExpiry
                    .lastExpiredReservations
                }
              </strong>
            </div>
          </div>
          <p
            className={
              health.status === 'ok' ? 'feature-ok' : 'feature-warning'
            }
          >
            {describeHealthDetail(health)}
          </p>
        </article>
      </div>

      <div className="health-slo-panel">
        <div className="ticket-topline">
          <span className="priority-badge priority-1">job queue</span>
          <span
            className={`readiness-pill readiness-pill-${readinessTone(
              jobQueueTotals.deadLetter > 0
                ? 'fail'
                : jobQueue.durable
                  ? 'ok'
                  : 'warn',
            )}`}
          >
            {jobQueue.durable ? 'durable' : 'fallback'}
          </span>
        </div>
        <div className="health-slo-grid">
          {jobQueueRows.map((row) => (
            <article className="health-slo-card" key={row.family}>
              <div className="ticket-topline">
                <span className="priority-badge priority-2">
                  {describeJobKind(row.family)}
                </span>
                <span
                  className={`readiness-pill readiness-pill-${readinessTone(
                    row.deadLetter > 0
                      ? 'fail'
                      : row.pending + row.running > 0
                        ? 'warn'
                        : 'ok',
                  )}`}
                >
                  {row.deadLetter > 0
                    ? 'a traiter'
                    : row.pending + row.running > 0
                      ? 'actif'
                      : 'calme'}
                </span>
              </div>
              <h3>{row.total} job(s)</h3>
              <p>
                File critique pour reprise automatique, retries bornes et
                isolation des dead-letters avant impact utilisateur.
              </p>
              <div className="feature-flag-rows">
                {['PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD_LETTER'].map(
                  (status) => {
                    const count =
                      row.counts.find((entry) => entry.status === status)
                        ?.count ?? 0;

                    return (
                      <div className="pricing-row" key={status}>
                        <span>{describeJobStatus(status)}</span>
                        <strong
                          className={`readiness-pill readiness-pill-${resolveJobStatusTone(
                            status,
                          )}`}
                        >
                          {count}
                        </strong>
                      </div>
                    );
                  },
                )}
              </div>
            </article>
          ))}
        </div>
        <p
          className={
            jobQueueTotals.deadLetter > 0 ? 'feature-warning' : 'feature-ok'
          }
        >
          {jobQueueTotals.deadLetter > 0
            ? 'Des jobs sont en dead-letter: les operations doivent ouvrir le journal avant tout pilote elargi.'
            : 'Aucun dead-letter signale par le backend; les familles critiques restent observables depuis la console.'}
        </p>
        <div className="health-audit-panel">
          <div className="ticket-topline">
            <span className="priority-badge priority-2">
              journal jobs
            </span>
            <div className="queue-actions">
              <button
                className="ghost-button"
                onClick={() => void refreshJobQueue()}
                type="button"
              >
                Resynchroniser
              </button>
              <span className="queue-status">{jobQueueStatus}</span>
            </div>
          </div>
          <div className="health-audit-toolbar">
            <div className="job-queue-filter-list" aria-label="Famille de jobs">
              {jobQueueKindFilters.map((filter) => (
                <button
                  className={`job-queue-filter ${
                    jobQueueKindFilter === filter.id
                      ? 'job-queue-filter-active'
                      : ''
                  }`}
                  key={filter.id}
                  onClick={() => setJobQueueKindFilter(filter.id)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="job-queue-filter-list" aria-label="Statut de jobs">
              {jobQueueStatusFilters.map((filter) => (
                <button
                  className={`job-queue-filter ${
                    jobQueueStateFilter === filter.id
                      ? 'job-queue-filter-active'
                      : ''
                  }`}
                  key={filter.id}
                  onClick={() => setJobQueueStateFilter(filter.id)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="job-queue-filter-summary">
              <div>
                <span>Jobs charges</span>
                <strong>{jobQueueFilterSummary.jobsLoaded}</strong>
              </div>
              <div>
                <span>Action ops</span>
                <strong>{jobQueueFilterSummary.actionRequired}</strong>
              </div>
              <div>
                <span>Retry moyen</span>
                <strong>{jobQueueFilterSummary.averageAttemptPressure}%</strong>
              </div>
              <div>
                <span>Retry max</span>
                <strong>{jobQueueFilterSummary.maxAttemptPressure}%</strong>
              </div>
              <div>
                <span>Requeue bloque</span>
                <strong>{jobQueueFilterSummary.requeueBlocked}</strong>
              </div>
              <p>
                {jobQueueFilterSummary.message}
                {jobQueueFilterSummary.dominantSignal
                  ? ` Signal principal: ${jobQueueFilterSummary.dominantSignal}.`
                  : ''}
              </p>
            </div>
            {jobQueueOwnerRows.length ? (
              <div className="job-owner-grid" aria-label="Files par owner">
                {jobQueueOwnerRows.map((row) => (
                  <article className="job-owner-card" key={row.owner}>
                    <div className="ticket-topline">
                      <strong>{row.owner}</strong>
                      <span
                        className={`readiness-pill readiness-pill-${readinessTone(
                          row.critical > 0
                            ? 'fail'
                            : row.blocked > 0
                              ? 'warn'
                              : 'ok',
                        )}`}
                      >
                        {row.total}
                      </span>
                    </div>
                    <span>
                      {row.critical} critique(s) · {row.blocked} requeue
                      bloque(s) · retry max {row.maxAttemptPressure}%
                    </span>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
          <div className="health-audit-list">
            {jobQueueDetails?.jobs.length ? (
              jobQueueDetails.jobs.map((job) => (
                <article className="health-audit-row" key={job.id}>
                  <div>
                    <strong>{describeJobKind(job.kind)}</strong>
                    <p>
                      {job.deadLetterReason ??
                        job.lastError ??
                        'Aucune erreur detaillee fournie.'}
                    </p>
                    <span className="health-inline-note">
                      {job.entityType ?? 'entity'}:{' '}
                      {job.entityId ?? 'non-reference'} · {job.attempts}/
                      {job.maxAttempts} tentative(s)
                    </span>
                    <span className="health-inline-note">
                      Pression retry {job.diagnostics.attemptPressure}% ·{' '}
                      {job.diagnostics.riskSignals.length
                        ? job.diagnostics.riskSignals.join(' · ')
                        : 'aucun signal non sensible'}
                    </span>
                    <span className="health-inline-note">
                      Owner {job.diagnostics.owner} · Requeue{' '}
                      {job.diagnostics.canRequeueSafely
                        ? 'autorise apres verification'
                        : 'bloque jusqu a correction'}
                    </span>
                    <p className="health-remediation-note">
                      {job.diagnostics.recommendedAction}
                    </p>
                  </div>
                  <div className="health-audit-meta">
                    <span
                      className={`readiness-pill readiness-pill-${resolveJobSeverityTone(
                        job.diagnostics.severity,
                      )}`}
                    >
                      {job.diagnostics.severity}
                    </span>
                    <span className="readiness-pill readiness-pill-bad">
                      {describeJobStatus(job.status)}
                    </span>
                    <button
                      className="ticket-button ticket-button-neutral"
                      disabled={
                        activeJobId === job.id || !canAttemptJobRequeue(job)
                      }
                      onClick={() => void requeueJob(job)}
                      title={
                        job.status === 'DEAD_LETTER'
                          ? job.diagnostics.canRequeueSafely
                            ? 'Confirmer puis remettre ce job en file'
                            : 'Corriger ou investiguer avant remise en file'
                          : 'Seuls les jobs dead-letter peuvent etre remis en file'
                      }
                      type="button"
                    >
                      Remettre en file
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <article className="health-audit-row">
                <div>
                  <strong>Aucun dead-letter actif</strong>
                  <p>
                    La console reste prete a afficher les jobs epuises avec leur
                    famille, leur entite et l action de remise en file.
                  </p>
                </div>
              </article>
            )}
          </div>
        </div>
      </div>

      <div className="health-slo-panel">
        <div className="ticket-topline">
          <span className="priority-badge priority-1">SLO runtime</span>
          <span
            className={`readiness-pill readiness-pill-${readinessTone(
              serviceLevelObjectives.posture === 'healthy'
                ? 'ok'
                : serviceLevelObjectives.posture === 'watch'
                  ? 'warn'
                  : 'fail',
            )}`}
          >
            {describeSloPosture(serviceLevelObjectives.posture)}
          </span>
        </div>
        <div className="health-slo-grid">
          {serviceLevelObjectives.objectives.map((objective) => (
            <article className="health-slo-card" key={objective.id}>
              <div className="ticket-topline">
                <span className="priority-badge priority-2">
                  {objective.owner}
                </span>
                <span
                  className={`readiness-pill readiness-pill-${readinessTone(
                    objective.state,
                  )}`}
                >
                  {describeReadinessCheckState(objective.state)}
                </span>
              </div>
              <h3>{objective.label}</h3>
              <p>{objective.currentSignal}</p>
              <div className="pricing-row">
                <span>Cible</span>
                <strong>{objective.target}</strong>
              </div>
              <div className="pricing-row">
                <span>Fenetre</span>
                <strong>{objective.window}</strong>
              </div>
              <div className="pricing-row">
                <span>Burn rate</span>
                <strong>{objective.burnRate}</strong>
              </div>
            </article>
          ))}
        </div>
        <div className="health-error-taxonomy">
          <div>
            <span className="priority-badge priority-3">
              crash/error taxonomy
            </span>
            <h3>Routage mobile unifie</h3>
          </div>
          <div className="health-taxonomy-list">
            {serviceLevelObjectives.mobileErrorTaxonomy.map((entry) => (
              <article className="health-taxonomy-row" key={entry.code}>
                <div>
                  <strong>{entry.code}</strong>
                  <p>{entry.userMessage}</p>
                  <span className="health-inline-note">
                    {entry.surface} · {entry.retryPolicy}
                  </span>
                </div>
                <div className="health-audit-meta">
                  <span
                    className={`readiness-pill readiness-pill-${readinessTone(
                      entry.severity === 'critical'
                        ? 'fail'
                        : entry.severity === 'high'
                          ? 'warn'
                          : 'ok',
                    )}`}
                  >
                    {entry.severity}
                  </span>
                  <span className="health-inline-note">{entry.owner}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="health-history-grid">
        {visibleHistory.length ? (
          visibleHistory.map((entry) => (
            <article
              className={`phase-card health-history-card ${
                entry.tone === 'alert'
                  ? 'health-history-card-alert'
                  : 'health-history-card-recovered'
              }`}
              key={entry.id}
            >
              <div className="ticket-topline">
                <span className="priority-badge priority-3">{entry.tone}</span>
                <span
                  className={`readiness-pill readiness-pill-${readinessTone(
                    entry.tone === 'alert' ? 'degraded' : 'ok',
                  )}`}
                >
                  {entry.tone === 'alert' ? 'incident' : 'retabli'}
                </span>
              </div>
              <h3>{entry.title}</h3>
              <p>{entry.detail}</p>
              {entry.acknowledgedAt && entry.acknowledgedBy ? (
                <span className="health-inline-note">
                  Vu par {entry.acknowledgedBy.fullName} le{' '}
                  {formatTimestamp(entry.acknowledgedAt)}
                </span>
              ) : null}
              <div className="ticket-actions">
                {entry.tone === 'alert' ? (
                  <button
                    className={`ticket-button ${
                      entry.acknowledgedAt
                        ? 'ticket-button-success'
                        : 'ticket-button-neutral'
                    }`}
                    onClick={() => acknowledgeIncident(entry.id)}
                    disabled={
                      Boolean(entry.acknowledgedAt) ||
                      activeIncidentId === entry.id
                    }
                    type="button"
                  >
                    {entry.acknowledgedAt ? 'Incident vu' : 'Marquer comme vu'}
                  </button>
                ) : null}
                <button
                  className="ticket-button ticket-button-danger"
                  onClick={() => muteIncident(entry.id)}
                  disabled={activeIncidentId === entry.id}
                  type="button"
                >
                  Masquer
                </button>
              </div>
              <span className="health-inline-note">
                {formatTimestamp(entry.createdAt)}
              </span>
            </article>
          ))
        ) : (
          <article className="phase-card health-history-card">
            <span className="phase-status phase-status-completed">
              watching
            </span>
            <h3>Aucun incident recu pendant cette session</h3>
            <p>
              Le watchdog est branche sur le flux admin et alimentera cet
              historique des qu une alerte ou une reprise sera publiee.
            </p>
          </article>
        )}
      </div>

      <div className="health-audit-panel">
        <div className="ticket-topline">
          <span className="priority-badge priority-2">audit ops</span>
          <span className="queue-status">
            {filteredAuditTrail.length} evenement(s) visibles sur{' '}
            {auditCounts.all} trace(s) recentes
          </span>
        </div>
        <div className="health-audit-toolbar">
          <div
            className="health-audit-filter-list"
            role="tablist"
            aria-label="Filtres du journal operations"
          >
            {healthAuditFilters.map((filter) => (
              <button
                key={filter.id}
                className={`health-audit-filter ${
                  auditFilter === filter.id ? 'health-audit-filter-active' : ''
                }`}
                onClick={() => setAuditFilter(filter.id)}
                role="tab"
                aria-selected={auditFilter === filter.id}
                type="button"
              >
                <span>{filter.label}</span>
                <strong>{auditCounts[filter.id]}</strong>
              </button>
            ))}
          </div>
          <p className="health-audit-filter-description">
            {activeAuditFilter.description}
          </p>
        </div>
        <div className="health-audit-list">
          {filteredAuditTrail.map((event) => (
            <article className="health-audit-row" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
              </div>
              <div className="health-audit-meta">
                <span
                  className={`readiness-pill readiness-pill-${resolveAuditToneClass(
                    event.tone,
                  )}`}
                >
                  {describeAuditTone(event.tone)}
                </span>
                <span className="health-inline-note">
                  {formatTimestamp(event.createdAt)}
                </span>
              </div>
            </article>
          ))}
          {!filteredAuditTrail.length ? (
            <article className="health-audit-row">
              <div>
                <strong>Aucun evenement pour ce filtre</strong>
                <p>
                  Le journal operations continue de tracer la sequence complete
                  des alertes, des prises en charge et des recoveries, mais rien
                  ne correspond au filtre actif pour le moment.
                </p>
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
