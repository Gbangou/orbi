import { type AdminPricingCalibrationResponse } from '@mobilis/api';

type PricingCalibrationBoardProps = {
  calibration: AdminPricingCalibrationResponse;
};

function formatPercent(value: number) {
  return `${value.toLocaleString('fr-FR')}%`;
}

function formatXof(value: number) {
  return `XOF ${value.toLocaleString('fr-FR')}`;
}

function priorityClass(priority: string) {
  if (priority === 'HIGH') {
    return 'priority-3';
  }

  if (priority === 'MEDIUM') {
    return 'priority-2';
  }

  return 'priority-1';
}

export function PricingCalibrationBoard({
  calibration,
}: PricingCalibrationBoardProps) {
  const { summary } = calibration;

  return (
    <section className="panel pricing-calibration-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Calibration terrain</p>
          <h2>Pricing appris par les courses reelles</h2>
        </div>
        <p className="lede">
          Les signaux reels des {calibration.window.lookbackDays} derniers jours
          donnent aux ops une lecture directe de l acceptation, des annulations,
          du paiement et de l economie chauffeur.
        </p>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>Demandes</span>
          <strong>{summary.totalRequests}</strong>
          <p>{summary.matchedRequests} matchees</p>
        </article>
        <article className="board-summary-card">
          <span>Acceptation</span>
          <strong>{formatPercent(summary.acceptanceRate)}</strong>
          <p>{formatPercent(summary.completionRate)} completees</p>
        </article>
        <article className="board-summary-card">
          <span>Annulation</span>
          <strong>{formatPercent(summary.cancellationRate)}</strong>
          <p>{summary.expiredRequests} expirations incluses</p>
        </article>
        <article className="board-summary-card">
          <span>Paiement</span>
          <strong>{formatPercent(summary.paymentConversionRate)}</strong>
          <p>{summary.paidRequests} demandes payees</p>
        </article>
        <article className="board-summary-card">
          <span>Webhook</span>
          <strong>{formatPercent(summary.paymentReconciliationRate)}</strong>
          <p>
            {summary.reconciledPaymentAttemptCount}/
            {summary.paymentAttemptCount} tentatives
          </p>
        </article>
      </div>

      <div className="pricing-calibration-grid">
        <article className="pricing-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-1">economie</span>
            <span className="phase-status phase-status-completed">live</span>
          </div>
          <h3>Unite economique</h3>
          <div className="pricing-row">
            <span>Prix moyen</span>
            <strong>{formatXof(summary.averageFare)}</strong>
          </div>
          <div className="pricing-row">
            <span>Payout chauffeur estime</span>
            <strong>{formatXof(summary.averageDriverPayout)}</strong>
          </div>
          <div className="pricing-row">
            <span>Prix / km</span>
            <strong>{summary.averageFarePerKm.toLocaleString('fr-FR')}</strong>
          </div>
          <div className="pricing-row">
            <span>Attente pickup</span>
            <strong>{summary.averagePickupWaitMinutes} min</strong>
          </div>
        </article>

        <article className="pricing-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-2">paiement</span>
            <span className="phase-status phase-status-next">webhook</span>
          </div>
          <h3>Reconciliation fournisseur</h3>
          <div className="pricing-row">
            <span>Succes paiement</span>
            <strong>{formatPercent(summary.paymentSuccessRate)}</strong>
          </div>
          <div className="pricing-row">
            <span>Tentatives echouees</span>
            <strong>{summary.failedPaymentAttemptCount}</strong>
          </div>
          <div className="pricing-row">
            <span>Non reconciliees</span>
            <strong>{calibration.paymentSignals.unresolved}</strong>
          </div>
          <div className="pricing-row">
            <span>Webhooks recus</span>
            <strong>{calibration.paymentSignals.webhookEvents}</strong>
          </div>
          <div className="pricing-row">
            <span>Webhooks ignores</span>
            <strong>{calibration.paymentSignals.webhookIgnored}</strong>
          </div>
          <div className="pricing-row">
            <span>Signatures verifiees</span>
            <strong>{calibration.paymentSignals.webhookSignatureVerified}</strong>
          </div>
          <div className="pricing-reasons">
            {calibration.paymentSignals.failureReasons.length ? (
              calibration.paymentSignals.failureReasons.map((failure) => (
                <p key={failure.reason}>
                  {failure.reason}: {failure.count}
                </p>
              ))
            ) : (
              <p>Aucune raison d echec dominante sur la fenetre observee.</p>
            )}
          </div>
        </article>

        <article className="pricing-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-2">fairness</span>
            <span className="phase-status phase-status-next">watch</span>
          </div>
          <h3>Alertes de calibration</h3>
          <div className="pricing-reasons">
            {calibration.alerts.map((alert) => (
              <p key={alert}>{alert}</p>
            ))}
          </div>
        </article>
      </div>

      {calibration.segments.length ? (
        <div className="pricing-segment-grid">
          {calibration.segments.map((segment) => (
            <article
              className="pricing-segment-card"
              key={`${segment.vehicleType}-${segment.serviceTier}`}
            >
              <div>
                <strong>{segment.serviceTier}</strong>
                <p>{segment.vehicleType}</p>
              </div>
              <span>{segment.requests} demandes</span>
              <span>{formatPercent(segment.completionRate)} completees</span>
              <span>{formatPercent(segment.cancellationRate)} annulees</span>
              <span>{formatXof(segment.averageFare)}</span>
            </article>
          ))}
        </div>
      ) : null}

      {calibration.timeWindows.length ? (
        <div className="pricing-window-grid">
          {calibration.timeWindows.map((timeWindow) => (
            <article className="pricing-window-card" key={timeWindow.key}>
              <div className="ticket-topline">
                <div>
                  <h3>{timeWindow.label}</h3>
                  <p>{timeWindow.requests} demandes observees</p>
                </div>
                <span className="phase-status phase-status-next">
                  cible {formatPercent(timeWindow.targetAcceptanceRate)}
                </span>
              </div>
              <div className="pricing-row">
                <span>Acceptation</span>
                <strong>{formatPercent(timeWindow.acceptanceRate)}</strong>
              </div>
              <div className="pricing-row">
                <span>Completion</span>
                <strong>{formatPercent(timeWindow.completionRate)}</strong>
              </div>
              <div className="pricing-row">
                <span>Annulation</span>
                <strong>{formatPercent(timeWindow.cancellationRate)}</strong>
              </div>
              <div className="pricing-row">
                <span>Prix moyen</span>
                <strong>{formatXof(timeWindow.averageFare)}</strong>
              </div>
              <div className="pricing-row">
                <span>Attente pickup</span>
                <strong>{timeWindow.averagePickupWaitMinutes} min</strong>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {calibration.geographySegments.length ? (
        <div className="pricing-geography-grid">
          {calibration.geographySegments.map((segment) => (
            <article
              className="pricing-window-card"
              key={`${segment.city}-${segment.districtProfile}`}
            >
              <div className="ticket-topline">
                <div>
                  <h3>{segment.city}</h3>
                  <p>{segment.districtProfile}</p>
                </div>
                <span className="phase-status phase-status-completed">
                  {segment.requests} demandes
                </span>
              </div>
              <div className="pricing-row">
                <span>Acceptation</span>
                <strong>{formatPercent(segment.acceptanceRate)}</strong>
              </div>
              <div className="pricing-row">
                <span>Completion</span>
                <strong>{formatPercent(segment.completionRate)}</strong>
              </div>
              <div className="pricing-row">
                <span>Annulation</span>
                <strong>{formatPercent(segment.cancellationRate)}</strong>
              </div>
              <div className="pricing-row">
                <span>Prix / km</span>
                <strong>{segment.averageFarePerKm.toLocaleString('fr-FR')}</strong>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="pricing-recommendation-grid">
        {calibration.recommendations.map((recommendation) => (
          <article
            className="pricing-recommendation-card"
            key={`${recommendation.scope}-${recommendation.action}`}
          >
            <div className="ticket-topline">
              <span
                className={`priority-badge ${priorityClass(
                  recommendation.priority,
                )}`}
              >
                {recommendation.priority}
              </span>
              <span>{recommendation.scope}</span>
            </div>
            <h3>{recommendation.action}</h3>
            <p>{recommendation.rationale}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
