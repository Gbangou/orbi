import type { AdminFinanceDashboardResponse } from "@orbi/api";
import { formatAdminDateTime } from "./admin-ops-kernel";

type FinanceDashboardBoardProps = {
  dashboard: AdminFinanceDashboardResponse;
};

function formatMoney(amount: number, currency: string) {
  return `${currency} ${Math.round(amount).toLocaleString("fr-FR")}`;
}

function formatAge(minutes: number | null) {
  if (minutes === null) {
    return "Aucun retard";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

function severityLabel(severity: AdminFinanceDashboardResponse["risks"][number]["severity"]) {
  if (severity === "critical") {
    return "Critique";
  }

  if (severity === "watch") {
    return "A surveiller";
  }

  return "OK";
}

export function FinanceDashboardBoard({ dashboard }: FinanceDashboardBoardProps) {
  const { summary } = dashboard;

  return (
    <section className="panel ops-panel">
      <div className="board-heading">
        <div>
          <p className="eyebrow">Finance control tower</p>
          <h2>Paiements, remboursements et payouts</h2>
          <p>
            Vue consolidee des risques argent sur les dernieres{" "}
            {dashboard.lookbackHours}h, mise a jour{" "}
            {formatAdminDateTime(dashboard.generatedAt)}.
          </p>
        </div>
      </div>

      <div className="board-summary-grid">
        <div className="board-summary-card">
          <span>Refund pending</span>
          <strong>{summary.refundPending}</strong>
          <p>{summary.refundedPayments} remboursements finalises.</p>
        </div>
        <div className="board-summary-card">
          <span>Wallet recovery</span>
          <strong>{formatMoney(summary.walletRecoveryDue, summary.currency)}</strong>
          <p>{summary.walletsInRecovery} wallets chauffeur a recouvrer.</p>
        </div>
        <div className="board-summary-card">
          <span>Payout backlog</span>
          <strong>{formatMoney(summary.payoutBacklog, summary.currency)}</strong>
          <p>{summary.preparedPayouts} payouts prepares.</p>
        </div>
        <div className="board-summary-card">
          <span>Webhook ignored</span>
          <strong>{summary.ignoredWebhooks}</strong>
          <p>
            {summary.webhookConflicts} conflits,{" "}
            {summary.webhookUnknownReferences} references inconnues.
          </p>
        </div>
        <div className="board-summary-card">
          <span>Reconciliation age</span>
          <strong>{formatAge(summary.oldestUnreconciledAgeMinutes)}</strong>
          <p>{summary.reconciliationRate}% des tentatives reconciliees.</p>
        </div>
      </div>

      <div className="finance-risk-list">
        {dashboard.risks.map((risk) => (
          <div className="finance-risk-row" key={risk.id}>
            <div>
              <span>Signal</span>
              <strong>{risk.label}</strong>
            </div>
            <span className={`status-pill status-${risk.severity}`}>
              {severityLabel(risk.severity)}
            </span>
            <strong>
              {risk.value === null
                ? "Aucun"
                : risk.id.includes("wallet") || risk.id.includes("payout")
                  ? formatMoney(risk.value, summary.currency)
                  : risk.id.includes("age")
                    ? formatAge(risk.value)
                    : risk.value.toLocaleString("fr-FR")}
            </strong>
            <strong>{risk.owner}</strong>
            <p>{risk.action}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
