'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acknowledgeAdminHealthIncident,
  authenticateAndFetchCurrentUser,
  createMobilisApiClient,
  fetchHealthCheck,
  muteAdminHealthIncident,
  type HealthCheckResponse,
} from '@mobilis/api';
import { describeRealtimeConnection } from '@mobilis/ui';
import {
  adminSyncHighlightDurationMs,
  resolveHealthTransitionLabel,
} from './admin-ops-kernel';
import { mobilisDemoAccounts, mobilisRuntimeConfig } from '@mobilis/config';
import { subscribeToAdminRealtime } from './admin-realtime';

type SystemHealthBoardProps = {
  initialHealth: HealthCheckResponse;
};

type HealthHistoryEntry = HealthCheckResponse['operations']['healthHistory'][number];
type HealthAuditEvent = {
  id: string;
  tone: 'alert' | 'recovered' | 'acknowledged' | 'muted';
  title: string;
  detail: string;
  createdAt: string;
};
type HealthAuditFilter = 'all' | 'incidents' | 'recoveries' | 'human-actions';

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
  if (!value) {
    return 'Aucun signal';
  }

  return new Date(value).toLocaleString('fr-FR', {
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

function buildHealthAuditTrail(history: HealthHistoryEntry[]): HealthAuditEvent[] {
  return history
    .flatMap((entry) => {
      const events: HealthAuditEvent[] = [
        {
          id: `${entry.id}:created`,
          tone: entry.tone,
          title:
            entry.tone === 'alert'
              ? 'Alerte publiee'
              : 'Recovery publie',
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

export function SystemHealthBoard({
  initialHealth,
}: SystemHealthBoardProps) {
  const [health, setHealth] = useState(initialHealth);
  const [status, setStatus] = useState('Health watchdog synchronise.');
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [history, setHistory] = useState<HealthHistoryEntry[]>(
    initialHealth.operations.healthHistory,
  );
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
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

  const client = useMemo(
    () =>
      createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
        version: mobilisRuntimeConfig.apiVersion,
      }),
    [],
  );

  const refreshHealth = useCallback(
    async (
      message = 'Sante systeme resynchronisee.',
    ) => {
      try {
        const response = await fetchHealthCheck(client);
        setHealth(response);
        setHistory(response.operations.healthHistory);
        setStatus(message);
      } catch {
        setStatus("Impossible d'actualiser la sante systeme.");
      }
    },
    [client],
  );

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

  const acknowledgeIncident = useCallback(
    async (incidentId: string) => {
      try {
        setActiveIncidentId(incidentId);
        const { authClient } = await authenticateAndFetchCurrentUser(
          client,
          mobilisDemoAccounts.admin,
        );

        await acknowledgeAdminHealthIncident(authClient, incidentId);
        await refreshHealth('Incident health reconnu par les operations.');
      } catch {
        setStatus("Impossible de marquer l'incident comme vu.");
      } finally {
        setActiveIncidentId(null);
      }
    },
    [client, refreshHealth],
  );

  const muteIncident = useCallback(
    async (incidentId: string) => {
      try {
        setActiveIncidentId(incidentId);
        const { authClient } = await authenticateAndFetchCurrentUser(
          client,
          mobilisDemoAccounts.admin,
        );

        await muteAdminHealthIncident(authClient, incidentId);
        await refreshHealth('Incident health masque pour toutes les consoles ops.');
      } catch {
        setStatus("Impossible de masquer l'incident.");
      } finally {
        setActiveIncidentId(null);
      }
    },
    [client, refreshHealth],
  );

  useEffect(() => {
    const stream = subscribeToAdminRealtime({
      'system.health-alert': () =>
        void refreshHealth('Alerte health recue en temps reel.'),
      'system.health-recovered': () =>
        void refreshHealth('Sante systeme retablie en temps reel.'),
      'system.health-incident-acknowledged': () =>
        void refreshHealth('Un incident health vient d etre reconnu par une autre console.'),
      'system.health-incident-muted': () =>
        void refreshHealth('Un incident health vient d etre masque par une autre console.'),
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
  }, [refreshHealth]);

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
          <strong>{describeDependencyState(health.dependencies.realtime)}</strong>
          <p>
            {health.infrastructure.realtime.activeStreams} flux,{' '}
            {health.infrastructure.realtime.publishedEvents} evenements
          </p>
        </article>
        <article className="board-summary-card">
          <span>Sweeper reservations</span>
          <strong>
            {describeDependencyState(health.dependencies.driverReservationExpiry)}
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
          <strong>
            {describeSloPosture(serviceLevelObjectives.posture)}
          </strong>
          <p>
            {serviceLevelObjectives.failingObjectives} breach(s),{' '}
            {serviceLevelObjectives.warningObjectives} watch
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
                <p>Adapter actif, backplane et degradation du transport live.</p>
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
                {health.operations.driverReservationExpiry.lastDurationMs !== null
                  ? `${health.operations.driverReservationExpiry.lastDurationMs} ms`
                  : 'n/a'}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Reservations expirees</span>
              <strong>
                {health.operations.driverReservationExpiry.lastExpiredReservations}
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
                    disabled={Boolean(entry.acknowledgedAt) || activeIncidentId === entry.id}
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
            <span className="phase-status phase-status-completed">watching</span>
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
          <div className="health-audit-filter-list" role="tablist" aria-label="Filtres du journal operations">
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
                  des alertes, des prises en charge et des recoveries, mais
                  rien ne correspond au filtre actif pour le moment.
                </p>
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
