'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdminFeatureFlagsResponse,
  AdminDriverWalletsResponse,
  AdminLaunchReadinessActionAcknowledgementResponse,
  AdminLaunchReadinessResponse,
  AdminLiveOpsResponse,
  AdminPaymentWebhookEventsResponse,
  DriverOnboardingQueueResponse,
  HealthCheckResponse,
  SupportTicketQueueResponse,
} from '@mobilis/api';
import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
} from './admin-server-security';
import {
  describeProductionReadiness,
  describeReadinessState,
  resolveProductionPilotDecision,
  resolveProductionReadinessState,
  resolveReadinessGroupState,
  type ReadinessState,
} from './launch-readiness-rules';
import { subscribeToAdminRealtime } from './admin-realtime';

type LaunchReadinessBoardProps = {
  liveOps: AdminLiveOpsResponse;
  support: SupportTicketQueueResponse;
  onboardingQueue: DriverOnboardingQueueResponse;
  featureFlags: AdminFeatureFlagsResponse;
  paymentWebhookJournal: AdminPaymentWebhookEventsResponse;
  driverWallets: AdminDriverWalletsResponse;
  launchReadiness?: AdminLaunchReadinessResponse;
  productionReadiness?: HealthCheckResponse['operations']['productionReadiness'];
  pricingScenarioCount: number;
};

type ReadinessCheck = {
  label: string;
  detail: string;
  state: ReadinessState;
};

async function fetchLaunchReadiness() {
  const response = await fetch('/api/admin/launch-readiness');

  if (!response.ok) {
    throw new Error('Launch readiness fetch failed');
  }

  return (await response.json()) as AdminLaunchReadinessResponse;
}

async function acknowledgeLaunchReadinessAction(
  checkId: string,
  payload: {
    owner: 'ops' | 'engineering' | 'support' | 'finance';
    notes: string;
    idempotencyKey: string;
  },
) {
  const response = await fetch(
    `/api/admin/launch-readiness/actions/${checkId}/acknowledge`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [adminMutationHeaderName]: adminMutationHeaderValue,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error('Launch readiness acknowledgement failed');
  }

  return (await response.json()) as AdminLaunchReadinessActionAcknowledgementResponse;
}

function describeActionOwner(owner: string) {
  if (owner === 'engineering') {
    return 'engineering';
  }

  if (owner === 'finance') {
    return 'finance';
  }

  if (owner === 'support') {
    return 'support';
  }

  return 'ops';
}

function describeActionSeverity(severity: string) {
  return severity === 'blocking' ? 'bloquant' : 'warning';
}

function describeSafetyCapabilityStatus(status: string) {
  if (status === 'active') {
    return 'actif';
  }

  if (status === 'partial') {
    return 'partiel';
  }

  return 'a livrer';
}

function describeFieldQualityState(state: string) {
  if (state === 'excellent') {
    return 'excellent';
  }

  if (state === 'blocked') {
    return 'bloque';
  }

  return 'surveillance';
}

function describeAssuranceGateStatus(status: string) {
  if (status === 'covered') {
    return 'couvert';
  }

  if (status === 'partial') {
    return 'partiel';
  }

  return 'manquant';
}

function resolveAssuranceGateTone(status: string) {
  if (status === 'covered') {
    return 'good';
  }

  if (status === 'partial') {
    return 'warn';
  }

  return 'bad';
}

function resolveFieldQualityTone(state: string) {
  if (state === 'excellent') {
    return 'good';
  }

  if (state === 'blocked') {
    return 'bad';
  }

  return 'warn';
}

export function LaunchReadinessBoard({
  liveOps,
  support,
  onboardingQueue,
  featureFlags,
  paymentWebhookJournal,
  driverWallets,
  launchReadiness,
  productionReadiness,
  pricingScenarioCount,
}: LaunchReadinessBoardProps) {
  const [liveLaunchReadiness, setLiveLaunchReadiness] = useState<
    AdminLaunchReadinessResponse | undefined
  >(launchReadiness);
  const currentLaunchReadiness = liveLaunchReadiness ?? launchReadiness;
  const [acknowledgedActions, setAcknowledgedActions] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      (currentLaunchReadiness?.acknowledgements ?? []).map((acknowledgement) => [
        acknowledgement.checkId,
        acknowledgement.acknowledgedAt,
      ]),
    ),
  );
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState(
    'Plan de stabilisation pret.',
  );
  const syncAcknowledgements = useCallback(
    (readiness?: AdminLaunchReadinessResponse) => {
      setAcknowledgedActions(
        Object.fromEntries(
          (readiness?.acknowledgements ?? []).map((acknowledgement) => [
            acknowledgement.checkId,
            acknowledgement.acknowledgedAt,
          ]),
        ),
      );
    },
    [],
  );
  const refreshLaunchReadiness = useCallback(
    async (message = 'Launch readiness resynchronisee.') => {
      try {
        const response = await fetchLaunchReadiness();

        setLiveLaunchReadiness(response);
        syncAcknowledgements(response);
        setActionStatus(message);
      } catch {
        setActionStatus("Launch readiness n'a pas pu etre resynchronisee.");
      }
    },
    [syncAcknowledgements],
  );

  useEffect(() => {
    const stream = subscribeToAdminRealtime({
      'system.launch-readiness-action-acknowledged': () =>
        void refreshLaunchReadiness('Action launch readiness prise par une console ops.'),
      'system.health-alert': () =>
        void refreshLaunchReadiness('Alerte health recue: readiness resynchronisee.'),
      'system.health-recovered': () =>
        void refreshLaunchReadiness('Health retablie: readiness resynchronisee.'),
      heartbeat: () => setActionStatus('Flux launch readiness actif.'),
    });

    stream.onopen = () => {
      setActionStatus('Flux launch readiness connecte.');
    };

    stream.onerror = () => {
      setActionStatus('Flux launch readiness en reconnexion.');
    };

    return () => stream.close();
  }, [refreshLaunchReadiness]);
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
  const paymentsFlag = featureFlags.flags.find(
    (flag) => flag.flag === 'payments',
  );
  const paymentsEnabled = paymentsFlag?.mode === 'on';
  const paymentReconciliationRate = liveOps.summary.payments.reconciliationRate;
  const refundPendingCount = liveOps.summary.payments.refundPending;
  const ignoredWebhookCount = paymentWebhookJournal.summary.ignoredEvents;
  const recoveryWalletCount = driverWallets.summary.recoveryWalletCount;
  const productionReadinessState =
    resolveProductionReadinessState(productionReadiness);

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
      label: 'Paiements MVP',
      detail:
        paymentsEnabled && paymentReconciliationRate >= 80
          ? `Paiements actifs, reconciliation ${paymentReconciliationRate}%.`
          : `Paiements a surveiller: flag ${paymentsFlag?.mode ?? 'absent'}, reconciliation ${paymentReconciliationRate}%.`,
      state:
        paymentsEnabled && paymentReconciliationRate >= 80 ? 'good' : 'warn',
    },
    {
      label: 'Refunds provider',
      detail:
        refundPendingCount === 0
          ? 'Aucun remboursement provider en attente.'
          : `${refundPendingCount} remboursement(s) attendent confirmation provider.`,
      state: refundPendingCount === 0 ? 'good' : 'warn',
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
      label: 'Production pilot',
      detail: describeProductionReadiness(productionReadiness),
      state: productionReadinessState,
    },
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
    {
      label: 'Webhooks argent',
      detail:
        ignoredWebhookCount === 0
          ? 'Aucun webhook ignore dans la page auditee.'
          : `${ignoredWebhookCount} webhook(s) ignore(s) visibles dans le journal.`,
      state: ignoredWebhookCount === 0 ? 'good' : 'warn',
    },
    {
      label: 'Recouvrement wallet',
      detail:
        recoveryWalletCount === 0
          ? 'Aucun wallet chauffeur en recouvrement.'
          : `${recoveryWalletCount} wallet(s) chauffeur ont un recouvrement du.`,
      state: recoveryWalletCount === 0 ? 'good' : 'warn',
    },
  ];

  const betaState = resolveReadinessGroupState(betaChecks);
  const prodState = resolveReadinessGroupState(prodChecks);
  const backendDecisionState =
    currentLaunchReadiness?.decision.state === 'approved'
      ? 'good'
      : currentLaunchReadiness?.decision.state === 'blocked'
        ? 'bad'
        : currentLaunchReadiness?.decision.state === 'limited'
          ? 'warn'
          : undefined;
  const productionPilotDecision = resolveProductionPilotDecision(
    productionReadiness,
    backendDecisionState ?? prodState,
  );
  const runtimeAttentionChecks =
    currentLaunchReadiness?.checks.filter((check) => check.state !== 'pass').slice(0, 3) ??
    productionReadiness?.checks
      .filter((check) => check.state !== 'pass')
      .slice(0, 3) ?? [];
  const nextActions = currentLaunchReadiness?.nextActions?.slice(0, 5) ?? [];
  const actionSummary = currentLaunchReadiness?.actionSummary;
  const actionCompletionRate = actionSummary?.completionRate ?? 0;
  const safetyBenchmark = currentLaunchReadiness?.safetyBenchmark;
  const securityAssurance = currentLaunchReadiness?.securityAssurance;
  const fieldQuality = currentLaunchReadiness?.fieldQuality;
  const safetyBenchmarkItems =
    safetyBenchmark?.capabilities
      .filter(
        (capability) =>
          capability.priority === 'critical' || capability.status !== 'active',
      )
      .slice(0, 5) ?? [];
  const assuranceGateItems =
    securityAssurance?.gates
      .filter(
        (gate) => gate.priority === 'critical' || gate.status !== 'covered',
      )
      .slice(0, 6) ?? [];
  const acknowledgementsByCheckId = useMemo(
    () =>
      new Map(
        (currentLaunchReadiness?.acknowledgements ?? []).map((acknowledgement) => [
          acknowledgement.checkId,
          acknowledgement,
        ]),
      ),
    [currentLaunchReadiness?.acknowledgements],
  );

  async function acknowledgeAction(
    action: NonNullable<AdminLaunchReadinessResponse['nextActions']>[number],
  ) {
    setBusyActionId(action.checkId);
    setActionStatus('Acknowledgement en cours...');

    try {
      const response = await acknowledgeLaunchReadinessAction(
        action.checkId,
        {
          owner: action.owner,
          notes: `Owner ${action.owner} confirme sur la console launch readiness.`,
          idempotencyKey: `${action.checkId}-${Date.now()}`,
        },
      );

      setAcknowledgedActions((current) => ({
        ...current,
        [action.checkId]: response.acknowledgement.acknowledgedAt,
      }));
      await refreshLaunchReadiness(
        `${action.owner} a pris l action ${action.checkId}.`,
      );
    } catch {
      setActionStatus("L acknowledgement n'a pas pu etre audite.");
    } finally {
      setBusyActionId(null);
    }
  }

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
          <span>Beta terrain</span>
          <strong>{describeReadinessState(betaState)}</strong>
          <p>Projection a court terme pour un pilote limite et encadre</p>
        </article>
        <article className="board-summary-card">
          <span>Production</span>
          <strong>{describeReadinessState(prodState)}</strong>
          <p>
            {prodState === 'bad'
              ? 'Pilote bloque tant que le risque runtime reste high'
              : 'Niveau de confiance pour un lancement plus large'}
          </p>
        </article>
        <article className="board-summary-card">
          <span>Risque runtime</span>
          <strong>
            {productionReadiness?.riskLevel ?? 'inconnu'}
          </strong>
          <p>{describeProductionReadiness(productionReadiness)}</p>
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

      <div
        className={`launch-decision-banner launch-decision-banner-${productionPilotDecision.state}`}
      >
        <div>
          <span>{productionPilotDecision.label}</span>
          <strong>
            {currentLaunchReadiness?.decision.label ?? productionPilotDecision.title}
          </strong>
          <p>{currentLaunchReadiness?.decision.detail ?? productionPilotDecision.detail}</p>
          {runtimeAttentionChecks.length ? (
            <div className="launch-action-list">
              {runtimeAttentionChecks.map((check) => (
                <span
                  className={`launch-action launch-action-${check.state}`}
                  key={check.id}
                >
                  {check.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="launch-decision-metrics">
          <span>risk</span>
          <strong>{productionReadiness?.riskLevel ?? 'unknown'}</strong>
          <p>
            {currentLaunchReadiness
              ? `${currentLaunchReadiness.summary.failedChecks} fail / ${currentLaunchReadiness.summary.warningChecks} warn`
              : productionReadiness
              ? `${productionReadiness.failedChecks} fail / ${productionReadiness.warningChecks} warn`
              : 'signal absent'}
          </p>
        </div>
      </div>

      <div className="fleet-readiness-strip" aria-label="Signal flotte pilote">
        <div className="fleet-lane">
          <span className="fleet-vehicle fleet-vehicle-moto" />
          <span className="fleet-line" />
          <span className="fleet-vehicle fleet-vehicle-car" />
        </div>
        <div>
          <strong>Flotte pilote encadree</strong>
          <p>
            Moto prioritaire pour trajets courts, voiture active pour confort,
            support et paiements surveilles avant extension.
          </p>
        </div>
      </div>

      {nextActions.length ? (
        <div className="launch-next-actions">
          <div className="launch-next-actions-heading">
            <div>
              <span>Plan de stabilisation</span>
              <strong>Actions avant extension</strong>
            </div>
            <p>{actionStatus}</p>
          </div>
          <div className="launch-action-progress">
            <div>
              <span>prise en charge</span>
              <strong>{actionCompletionRate}%</strong>
            </div>
            <div className="launch-action-progress-track">
              <span style={{ width: `${Math.min(100, actionCompletionRate)}%` }} />
            </div>
            <p>
              {actionSummary
                ? `${actionSummary.acknowledgedActions}/${actionSummary.totalActions} action(s), ${actionSummary.remainingBlockingActions} bloquant(s) sans owner`
                : 'Resume des actions non disponible sur ce backend.'}
            </p>
          </div>
          <div className="launch-next-action-list">
            {nextActions.map((action) => {
              const acknowledgement = acknowledgementsByCheckId.get(
                action.checkId,
              );

              return (
              <article
                className={`launch-next-action ${
                  acknowledgedActions[action.checkId]
                    ? 'launch-next-action-acknowledged'
                    : ''
                }`}
                key={action.checkId}
              >
                <div>
                  <span
                    className={`launch-action launch-action-${action.severity}`}
                  >
                    {describeActionSeverity(action.severity)}
                  </span>
                  <strong>{describeActionOwner(action.owner)}</strong>
                </div>
                <p>{action.action}</p>
                {acknowledgement ? (
                  <p className="launch-ack-note">
                    Pris par {acknowledgement.actor.name ?? acknowledgement.actor.role ?? 'ops'}.
                  </p>
                ) : null}
                <div className="launch-next-action-footer">
                  <code>{action.runbookAnchor}</code>
                  <button
                    className="launch-ack-button"
                    disabled={
                      busyActionId === action.checkId ||
                      Boolean(acknowledgedActions[action.checkId])
                    }
                    onClick={() => void acknowledgeAction(action)}
                    type="button"
                  >
                    {acknowledgedActions[action.checkId]
                      ? 'pris'
                      : busyActionId === action.checkId
                        ? '...'
                        : 'prendre'}
                  </button>
                </div>
              </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {safetyBenchmark ? (
        <div className="launch-safety-benchmark">
          <div className="launch-next-actions-heading">
            <div>
              <span>Benchmark securite</span>
              <strong>Parite leaders et surclassement local</strong>
            </div>
            <p>
              {safetyBenchmark.summary.criticalGaps} gap(s) critique(s) avant
              extension large
            </p>
          </div>
          <div className="launch-safety-score">
            <div>
              <span>parite</span>
              <strong>{safetyBenchmark.summary.competitorParityRate}%</strong>
              <p>
                {safetyBenchmark.summary.activeCapabilities} actif(s),{' '}
                {safetyBenchmark.summary.partialCapabilities} partiel(s),{' '}
                {safetyBenchmark.summary.plannedCapabilities} a livrer
              </p>
            </div>
            <div className="launch-action-progress-track">
              <span
                style={{
                  width: `${Math.min(
                    100,
                    safetyBenchmark.summary.competitorParityRate,
                  )}%`,
                }}
              />
            </div>
          </div>
          <div className="launch-safety-list">
            {safetyBenchmarkItems.map((capability) => (
              <article
                className={`launch-safety-item launch-safety-item-${capability.status}`}
                key={capability.id}
              >
                <div>
                  <strong>{capability.label}</strong>
                  <span>{describeSafetyCapabilityStatus(capability.status)}</span>
                </div>
                <p>{capability.mobilisSignal}</p>
                <small>{capability.nextStep}</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {securityAssurance ? (
        <div className="launch-assurance">
          <div className="launch-next-actions-heading">
            <div>
              <span>Assurance securite</span>
              <strong>Gates OWASP, MASVS et NIST SSDF</strong>
            </div>
            <p>
              {securityAssurance.summary.criticalOpenGates} gate(s)
              critique(s) encore ouverts
            </p>
          </div>
          <div className="launch-assurance-score">
            <div>
              <span>couverture</span>
              <strong>{securityAssurance.summary.coverageRate}%</strong>
              <p>
                {securityAssurance.summary.coveredGates} couvert(s),{' '}
                {securityAssurance.summary.partialGates} partiel(s),{' '}
                {securityAssurance.summary.missingGates} manquant(s)
              </p>
            </div>
            <div className="launch-action-progress-track">
              <span
                style={{
                  width: `${Math.min(
                    100,
                    securityAssurance.summary.coverageRate,
                  )}%`,
                }}
              />
            </div>
          </div>
          <div className="launch-assurance-list">
            {assuranceGateItems.map((gate) => (
              <article className="launch-assurance-card" key={gate.id}>
                <div className="ticket-topline">
                  <span
                    className={`readiness-pill readiness-pill-${resolveAssuranceGateTone(
                      gate.status,
                    )}`}
                  >
                    {describeAssuranceGateStatus(gate.status)}
                  </span>
                  <span className="launch-action launch-action-warning">
                    {gate.owner}
                  </span>
                </div>
                <h3>{gate.label}</h3>
                <p>{gate.currentSignal}</p>
                <small>{gate.frameworks.join(' / ')}</small>
                <em>{gate.nextStep}</em>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {fieldQuality ? (
        <div className="launch-field-quality">
          <div className="launch-next-actions-heading">
            <div>
              <span>Excellence terrain</span>
              <strong>Score operationnel compare leaders</strong>
            </div>
            <p>
              {fieldQuality.blockedSignals} bloque(s),{' '}
              {fieldQuality.watchSignals} sous surveillance
            </p>
          </div>
          <div className="launch-field-quality-score">
            <div>
              <span>score</span>
              <strong>{fieldQuality.score}/100</strong>
              <p>{describeFieldQualityState(fieldQuality.state)}</p>
            </div>
            <div className="launch-action-progress-track">
              <span style={{ width: `${Math.min(100, fieldQuality.score)}%` }} />
            </div>
          </div>
          <div className="launch-field-quality-list">
            {fieldQuality.signals.map((signal) => (
              <article className="launch-field-quality-card" key={signal.id}>
                <div className="ticket-topline">
                  <span
                    className={`readiness-pill readiness-pill-${resolveFieldQualityTone(
                      signal.state,
                    )}`}
                  >
                    {describeFieldQualityState(signal.state)}
                  </span>
                  <span className="launch-action launch-action-warning">
                    {signal.owner}
                  </span>
                </div>
                <h3>{signal.label}</h3>
                <strong>{signal.score}/100</strong>
                <p>{signal.mobilisSignal}</p>
                <small>{signal.competitorReference}</small>
                <em>{signal.nextStep}</em>
              </article>
            ))}
          </div>
        </div>
      ) : null}

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
          <h3>Avant une beta limitee</h3>
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
