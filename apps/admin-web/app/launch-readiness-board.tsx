'use client';

import type {
  AdminFeatureFlagsResponse,
  AdminLiveOpsResponse,
  DriverOnboardingQueueResponse,
  SupportTicketQueueResponse,
} from '@mobilis/api';

type LaunchReadinessBoardProps = {
  liveOps: AdminLiveOpsResponse;
  support: SupportTicketQueueResponse;
  onboardingQueue: DriverOnboardingQueueResponse;
  featureFlags: AdminFeatureFlagsResponse;
  pricingScenarioCount: number;
};

type ReadinessState = 'good' | 'warn' | 'bad';
type ReadinessCheck = {
  label: string;
  detail: string;
  state: ReadinessState;
};

function describeReadinessState(state: ReadinessState) {
  if (state === 'good') {
    return 'pret';
  }

  if (state === 'warn') {
    return 'a stabiliser';
  }

  return 'bloque';
}

export function LaunchReadinessBoard({
  liveOps,
  support,
  onboardingQueue,
  featureFlags,
  pricingScenarioCount,
}: LaunchReadinessBoardProps) {
  const openSupportCount = support.tickets.filter(
    (ticket) => ticket.status === 'OPEN' || ticket.status === 'IN_REVIEW',
  ).length;
  const urgentSupportCount = support.tickets.filter(
    (ticket) => ticket.priority === 3 && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED',
  ).length;
  const onboardingReviewCount = onboardingQueue.drivers.filter(
    (driver) => driver.reviewStatus === 'UNDER_REVIEW' || driver.reviewStatus === 'CHANGES_REQUESTED',
  ).length;
  const onboardingPendingDocuments = onboardingQueue.drivers.reduce(
    (total, driver) => total + driver.documentSummary.pending,
    0,
  );

  const betaChecks: ReadinessCheck[] = [
    {
      label: 'Support terrain',
      detail:
        urgentSupportCount === 0
          ? 'Aucun ticket P3 ouvert.'
          : `${urgentSupportCount} ticket(s) P3 encore ouverts.`,
      state: urgentSupportCount === 0 ? 'good' : 'warn',
    },
    {
      label: 'Ops onboarding',
      detail:
        onboardingReviewCount <= 3
          ? 'La file onboarding reste absorbable.'
          : `${onboardingReviewCount} dossiers demandent encore une action ops.`,
      state: onboardingReviewCount <= 3 ? 'good' : 'warn',
    },
    {
      label: 'Pricing observable',
      detail:
        pricingScenarioCount >= 3
          ? `${pricingScenarioCount} scenarios pricing visibles dans le board admin.`
          : 'La couverture pricing visible reste trop fine pour un pilote.',
      state: pricingScenarioCount >= 3 ? 'good' : 'warn',
    },
    {
      label: 'Flux temps reel',
      detail: featureFlags.infrastructure.realtime.degraded
        ? 'Le transport realtime est degrade.'
        : 'Le transport realtime ne signale pas de degradation.',
      state: featureFlags.infrastructure.realtime.degraded ? 'bad' : 'good',
    },
  ];

  const prodChecks: ReadinessCheck[] = [
    {
      label: 'Incidents ouverts',
      detail:
        openSupportCount <= 5
          ? `Charge support contenue (${openSupportCount} ticket(s) actifs).`
          : `${openSupportCount} tickets actifs: la charge support reste elevee.`,
      state: openSupportCount <= 5 ? 'good' : 'warn',
    },
    {
      label: 'Documents chauffeur',
      detail:
        onboardingPendingDocuments === 0
          ? 'Aucun justificatif encore en attente.'
          : `${onboardingPendingDocuments} justificatif(s) restent a approuver.`,
      state: onboardingPendingDocuments === 0 ? 'good' : 'warn',
    },
    {
      label: 'Temps reel strict',
      detail:
        featureFlags.infrastructure.realtime.activeStreams > 0
          ? `${featureFlags.infrastructure.realtime.activeStreams} flux actifs observes.`
          : 'Aucun flux actif observe au moment du snapshot.',
      state: featureFlags.infrastructure.realtime.activeStreams > 0 ? 'good' : 'warn',
    },
    {
      label: 'Charge live',
      detail:
        liveOps.summary.urgentSupportTickets === 0
          ? 'Aucun incident urgent dans la console live ops.'
          : `${liveOps.summary.urgentSupportTickets} incident(s) urgent(s) remontent encore.`,
      state: liveOps.summary.urgentSupportTickets === 0 ? 'good' : 'warn',
    },
  ];

  const betaState = betaChecks.some((check) => check.state === 'bad')
    ? 'bad'
    : betaChecks.some((check) => check.state === 'warn')
      ? 'warn'
      : 'good';
  const prodState = prodChecks.some((check) => check.state === 'bad')
    ? 'bad'
    : prodChecks.some((check) => check.state === 'warn')
      ? 'warn'
      : 'good';

  return (
    <section className="panel readiness-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Launch Readiness</p>
          <h2>Diagnostic beta et production</h2>
        </div>
        <p className="lede">
          Lecture rapide du niveau de preparation a partir des signaux deja
          visibles dans le backend, les ops, le support et l infra realtime.
        </p>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>Bêta terrain</span>
          <strong>{describeReadinessState(betaState)}</strong>
          <p>Projection a court terme pour un pilote limite et encadre</p>
        </article>
        <article className="board-summary-card">
          <span>Production</span>
          <strong>{describeReadinessState(prodState)}</strong>
          <p>Niveau de confiance pour un lancement plus large</p>
        </article>
        <article className="board-summary-card">
          <span>Support actif</span>
          <strong>{openSupportCount}</strong>
          <p>Tickets support encore ouverts ou en revue</p>
        </article>
        <article className="board-summary-card">
          <span>Docs en attente</span>
          <strong>{onboardingPendingDocuments}</strong>
          <p>Justificatifs chauffeur encore non approuves</p>
        </article>
      </div>

      <div className="readiness-grid">
        <article className="phase-card">
          <div className="ticket-topline">
            <span className={`phase-status phase-status-${betaState}`}>
              {describeReadinessState(betaState)}
            </span>
            <span className={`readiness-pill readiness-pill-${betaState}`}>
              beta
            </span>
          </div>
          <h3>Avant une bêta limitée</h3>
          <div className="readiness-list">
            {betaChecks.map((check) => (
              <div className="readiness-row" key={check.label}>
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
                <span className={`readiness-pill readiness-pill-${check.state}`}>
                  {describeReadinessState(check.state)}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="phase-card">
          <div className="ticket-topline">
            <span className={`phase-status phase-status-${prodState}`}>
              {describeReadinessState(prodState)}
            </span>
            <span className={`readiness-pill readiness-pill-${prodState}`}>
              prod
            </span>
          </div>
          <h3>Avant une mise en production</h3>
          <div className="readiness-list">
            {prodChecks.map((check) => (
              <div className="readiness-row" key={check.label}>
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
                <span className={`readiness-pill readiness-pill-${check.state}`}>
                  {describeReadinessState(check.state)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
