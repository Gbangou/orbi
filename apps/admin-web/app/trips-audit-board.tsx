'use client';

import { useCallback, useState } from 'react';
import type { AdminTripsAuditResponse } from '@orbi/api';
import { formatOperationalStatus } from '@orbi/ui';
import { fetchAdminJson } from './admin-client-fetch';

type TripsAuditBoardProps = {
  initialAudit: AdminTripsAuditResponse;
};

const lookbackOptions = [24, 72, 168] as const;

function formatMoney(value: number, currency: string) {
  return `${currency} ${Math.round(value).toLocaleString('fr-FR')}`;
}

function formatOwner(value: string) {
  if (value === 'finance') return 'Finance';
  if (value === 'ops') return 'Ops';
  if (value === 'support') return 'Support';
  return 'Engineering';
}

async function fetchTripsAudit(lookbackHours: number) {
  return fetchAdminJson<AdminTripsAuditResponse>(
    `/api/admin/trips/audit?lookbackHours=${lookbackHours}`,
  );
}

export function TripsAuditBoard({ initialAudit }: TripsAuditBoardProps) {
  const [audit, setAudit] = useState(initialAudit);
  const [status, setStatus] = useState('Audit trajets synchronise.');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshAudit = useCallback(async (lookbackHours: number) => {
    setIsRefreshing(true);
    setStatus('Rafraichissement audit trajets...');
    try {
      const response = await fetchTripsAudit(lookbackHours);
      setAudit(response);
      setStatus('Audit trajets a jour.');
    } catch {
      setStatus("L'audit trajets n'a pas pu etre rafraichi.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <section className="panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Audit pilote</p>
          <h2>Trajets, argent et confiance</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Lecture quotidienne des courses pour detecter les risques paiement,
            GPS, annulation et support avant cloture operations.
          </p>
          <div className="queue-actions">
            {lookbackOptions.map((hours) => (
              <button
                className="ghost-button"
                disabled={isRefreshing}
                key={hours}
                onClick={() => void refreshAudit(hours)}
                type="button"
              >
                {hours}h
              </button>
            ))}
            <a
              className="secondary-link"
              href="/api/admin/trips/export.csv?limit=300"
            >
              Export CSV
            </a>
          </div>
          <span className="queue-status">
            {status} Fenetre: {audit.window.lookbackHours}h.
          </span>
        </div>
      </div>

      <div className="grid">
        <article className="card">
          <span>Courses auditees</span>
          <strong>{audit.summary.totalTrips}</strong>
          <p>{audit.summary.completionRate}% completion</p>
        </article>
        <article className="card">
          <span>Risque critique</span>
          <strong>{audit.summary.criticalRiskTripCount}</strong>
          <p>{audit.summary.riskTripCount} course(s) a traiter</p>
        </article>
        <article className="card">
          <span>Argent a verifier</span>
          <strong>
            {formatMoney(audit.summary.moneyAtRisk, audit.summary.currency)}
          </strong>
          <p>{audit.summary.mobileMoneyReconciliationRate}% reconciliation MM</p>
        </article>
        <article className="card">
          <span>Remboursements</span>
          <strong>{audit.summary.refundPendingTrips}</strong>
          <p>Provider en attente</p>
        </article>
      </div>

      <div className="trip-meta-grid">
        {Object.entries(audit.summary.byStatus).map(([statusKey, count]) => (
          <div className="trip-meta-card" key={statusKey}>
            <span>{formatOperationalStatus(statusKey.toUpperCase())}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>

      <div className="roadmap-grid live-ops-grid trips-audit-owner-grid">
        {audit.ownerQueue.map((owner) => (
          <article className="phase-card" key={owner.owner}>
            <span className="phase-status phase-status-next">
              {formatOwner(owner.owner)}
            </span>
            <h3>{owner.count} dossier(s)</h3>
            <p>
              {owner.critical} critique(s),{' '}
              {formatMoney(owner.moneyAtRisk, audit.summary.currency)} a
              verifier.
            </p>
          </article>
        ))}
      </div>

      {audit.recommendations.length ? (
        <div className="ops-alert-strip">
          {audit.recommendations.map((item) => (
            <span className="ops-alert-pill" key={item}>
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <div className="roadmap-grid live-ops-grid">
        {audit.riskTrips.map((trip) => (
          <article
            className={`phase-card live-trip-card trips-audit-risk-${trip.severity}`}
            key={trip.id}
          >
            <div className="ticket-topline">
              <span className="phase-status phase-status-next">
                {formatOwner(trip.owner)}
              </span>
              <span className="live-trip-fare">
                {formatMoney(trip.fare, trip.currency)}
              </span>
            </div>
            <h3>{trip.route}</h3>
            <p>
              {trip.riderName} avec {trip.driverName} -{' '}
              {formatOperationalStatus(trip.status)}
            </p>
            <div className="trip-meta-grid">
              <div className="trip-meta-card">
                <span>Paiement</span>
                <strong>{trip.paymentMethod}</strong>
                <small>{trip.paymentStatus}</small>
              </div>
              <div className="trip-meta-card">
                <span>Severite</span>
                <strong>{trip.severity}</strong>
              </div>
            </div>
            {trip.reasons.map((reason) => (
              <p className="audit-reason" key={reason}>
                {reason}
              </p>
            ))}
          </article>
        ))}
        {!audit.riskTrips.length ? (
          <article className="phase-card">
            <span className="phase-status phase-status-completed">stable</span>
            <h3>Aucun risque prioritaire</h3>
            <p>
              Les trajets de la fenetre auditee ne presentent pas de signal
              bloquant pour la cloture operations.
            </p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
