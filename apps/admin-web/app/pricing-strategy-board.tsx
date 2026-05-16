import { type PricingEstimate } from '@orbi/api';

type PricingScenario = {
  id: string;
  title: string;
  note: string;
  estimate: PricingEstimate;
};

type PricingStrategyBoardProps = {
  scenarios: PricingScenario[];
};

export function PricingStrategyBoard({
  scenarios,
}: PricingStrategyBoardProps) {
  const scenarioCount = scenarios.length;

  return (
    <section className="panel pricing-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Pricing Burkina</p>
          <h2>Simulation locale et fairness economique</h2>
        </div>
        <p className="lede">
          Le pricing Orbi tient compte de la ville, du profil de quartier,
          de la pression offre-demande et d une logique d accessibilite pour
          garder un systeme plus lisible et plus juste.
        </p>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>Scenarios</span>
          <strong>{scenarioCount}</strong>
          <p>Simulations actuellement visibles par les ops</p>
        </article>
        <article className="board-summary-card">
          <span>Focus</span>
          <strong>Fairness</strong>
          <p>Prix lisible, soutenable et explicable pour le terrain</p>
        </article>
      </div>

      <div className="pricing-grid">
        {scenarios.map((scenario) => (
          <article className="pricing-card" key={scenario.id}>
            <div className="ticket-topline">
              <span className="priority-badge priority-1">
                {scenario.estimate.city ?? 'BURKINA'}
              </span>
              <span className="phase-status phase-status-next">
                {scenario.estimate.serviceTier}
              </span>
            </div>
            <h3>{scenario.title}</h3>
            <p>{scenario.note}</p>
            <div className="pricing-row">
              <span>Prix estime</span>
              <strong>
                {scenario.estimate.currency} {scenario.estimate.estimatedFare}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Fenetre de confiance</span>
              <strong>
                {scenario.estimate.fareBreakdown.priceWindow.min} -{' '}
                {scenario.estimate.fareBreakdown.priceWindow.max}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Payout chauffeur</span>
              <strong>
                {scenario.estimate.currency}{' '}
                {scenario.estimate.driverEconomics.driverPayout}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Ajustement local</span>
              <strong>
                {scenario.estimate.currency}{' '}
                {scenario.estimate.fareBreakdown.localAdjustmentAmount}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Soutien accessibilite</span>
              <strong>
                {scenario.estimate.currency}{' '}
                {scenario.estimate.fareBreakdown.affordabilitySupportAmount}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Contexte route</span>
              <strong>
                {scenario.estimate.operatingContext.trafficLevel} /{' '}
                {scenario.estimate.operatingContext.roadCondition}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Meteo</span>
              <strong>{scenario.estimate.operatingContext.weatherCondition}</strong>
            </div>
            <div className="pricing-row">
              <span>Tension flotte</span>
              <strong>
                {scenario.estimate.operatingContext.supplyPressureLevel} · score{' '}
                {scenario.estimate.operatingContext.availabilityScore}/100
              </strong>
            </div>
            <div className="pricing-row">
              <span>Approche chauffeur</span>
              <strong>
                {scenario.estimate.trustAndPolicy.driverPickupDistanceIncludedInFare
                  ? 'Incluse au prix'
                  : 'Dispatch/ETA, hors frais cache'}
              </strong>
            </div>
            <div className="pricing-row">
              <span>Ajustements contextuels</span>
              <strong>
                {scenario.estimate.currency}{' '}
                {scenario.estimate.fareBreakdown.trafficAdjustmentAmount +
                  scenario.estimate.fareBreakdown.weatherAdjustmentAmount +
                  scenario.estimate.fareBreakdown.roadConditionAdjustmentAmount +
                  scenario.estimate.fareBreakdown.availabilityAdjustmentAmount}
              </strong>
            </div>
            <div className="pricing-reasons">
              {scenario.estimate.fareBreakdown.reasons
                .slice(0, 4)
                .map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
