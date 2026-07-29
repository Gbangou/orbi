'use client';

import { useCallback, useState } from 'react';
import type { AdminTripsAuditResponse } from '@orbi/api';
import { formatOperationalStatus } from '@orbi/ui';
import {
  AdminClientRequestError,
  fetchAdminJson,
  postAdminMutation,
} from './admin-client-fetch';
import { formatAdminMoney } from './admin-ops-kernel';

type TripsAuditBoardProps = {
  initialAudit: AdminTripsAuditResponse;
};

const lookbackOptions = [24, 72, 168] as const;
const tripsAuditLimitOptions = [50, 100, 300, 500] as const;
const forceClosableTripStatuses = new Set([
  'MATCHED',
  'DRIVER_ARRIVING',
  'IN_PROGRESS',
]);
const adminMutationTimeoutMs = 20_000;

function resolveTripsAuditLimit(value: string) {
  return (
    tripsAuditLimitOptions.find((option) => String(option) === value) ?? 300
  );
}

function formatOwner(value: string) {
  if (value === 'finance') return 'Finance';
  if (value === 'ops') return 'Ops';
  if (value === 'support') return 'Support';
  return 'Engineering';
}

function getAdminActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AdminClientRequestError) {
    return `${fallback}: ${error.message}`;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return `${fallback}: delai depasse, verifiez la connexion backend puis recommencez.`;
  }

  return fallback;
}

async function withAdminTimeout<TResponse>(
  operation: (signal: AbortSignal) => Promise<TResponse>,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    adminMutationTimeoutMs,
  );

  try {
    return await operation(controller.signal);
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchTripsAudit(opts: {
  lookbackHours?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const params = new URLSearchParams();
  if (opts.lookbackHours) params.set('lookbackHours', String(opts.lookbackHours));
  if (opts.status) params.set('status', opts.status);
  if (opts.fromDate) params.set('fromDate', opts.fromDate);
  if (opts.toDate) params.set('toDate', opts.toDate);

  return fetchAdminJson<AdminTripsAuditResponse>(
    `/api/admin/trips/audit?${params.toString()}`,
  );
}

function buildExportUrl(opts: {
  status: string;
  fromDate: string;
  toDate: string;
  search: string;
  limit: number;
}) {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.fromDate) params.set('fromDate', opts.fromDate);
  if (opts.toDate) params.set('toDate', opts.toDate);
  if (opts.search) params.set('search', opts.search);
  params.set('limit', String(opts.limit));
  return `/api/admin/trips/export.csv?${params.toString()}`;
}

export function TripsAuditBoard({ initialAudit }: TripsAuditBoardProps) {
  const [audit, setAudit] = useState(initialAudit);
  const [statusMsg, setStatusMsg] = useState('Audit trajets synchronise.');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterLimit, setFilterLimit] = useState(300);
  const [resolutionReasonByTripId, setResolutionReasonByTripId] = useState<
    Record<string, string>
  >({});
  const [resolvingTripId, setResolvingTripId] = useState<string | null>(null);

  const refreshAudit = useCallback(
    async (opts: {
      lookbackHours?: number;
      status?: string;
      fromDate?: string;
      toDate?: string;
    }) => {
      setIsRefreshing(true);
      setStatusMsg('Rafraichissement audit trajets...');
      try {
        const response = await fetchTripsAudit(opts);
        setAudit(response);
        setStatusMsg('Audit trajets a jour.');
      } catch {
        setStatusMsg("L'audit trajets n'a pas pu etre rafraichi.");
      } finally {
        setIsRefreshing(false);
      }
    },
    [],
  );

  const applyAuditFilters = useCallback(() => {
    void refreshAudit({
      status: filterStatus || undefined,
      fromDate: filterFrom || undefined,
      toDate: filterTo || undefined,
    });
  }, [filterFrom, filterStatus, filterTo, refreshAudit]);

  const resolveRisk = useCallback(
    async (tripId: string) => {
      const reason = (resolutionReasonByTripId[tripId] ?? '').trim();

      if (reason.length < 10) {
        setStatusMsg('Ajoutez une justification de resolution plus precise.');
        return;
      }

      setResolvingTripId(tripId);
      setStatusMsg('Cloture auditee du risque trajet...');

      try {
        await withAdminTimeout((signal) =>
          postAdminMutation(`/api/admin/trips/audit/${tripId}/resolve`, {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
            signal,
          }),
        );
        setResolutionReasonByTripId((current) => {
          const next = { ...current };
          delete next[tripId];
          return next;
        });
        setStatusMsg('Risque trajet cloture et audite.');
        await refreshAudit({
          status: filterStatus || undefined,
          fromDate: filterFrom || undefined,
          toDate: filterTo || undefined,
        });
      } catch (error) {
        setStatusMsg(
          getAdminActionErrorMessage(
            error,
            "Le risque trajet n'a pas pu etre cloture",
          ),
        );
      } finally {
        setResolvingTripId(null);
      }
    },
    [
      filterFrom,
      filterStatus,
      filterTo,
      refreshAudit,
      resolutionReasonByTripId,
    ],
  );

  const forceCloseTrip = useCallback(
    async (tripId: string) => {
      const reason = (resolutionReasonByTripId[tripId] ?? '').trim();

      if (reason.length < 10) {
        setStatusMsg('Ajoutez une justification de deblocage plus precise.');
        return;
      }

      setResolvingTripId(tripId);
      setStatusMsg('Deblocage audite du trajet actif...');

      try {
        await withAdminTimeout((signal) =>
          postAdminMutation(`/api/admin/trips/${tripId}/force-close`, {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
            signal,
          }),
        );
        setResolutionReasonByTripId((current) => {
          const next = { ...current };
          delete next[tripId];
          return next;
        });
        setStatusMsg('Trajet actif ferme. Rider et chauffeur peuvent rematcher.');
        await refreshAudit({
          status: filterStatus || undefined,
          fromDate: filterFrom || undefined,
          toDate: filterTo || undefined,
        });
      } catch (error) {
        setStatusMsg(
          getAdminActionErrorMessage(
            error,
            "Le trajet actif n'a pas pu etre debloque",
          ),
        );
      } finally {
        setResolvingTripId(null);
      }
    },
    [
      filterFrom,
      filterStatus,
      filterTo,
      refreshAudit,
      resolutionReasonByTripId,
    ],
  );

  const exportUrl = buildExportUrl({
    status: filterStatus,
    fromDate: filterFrom,
    toDate: filterTo,
    search: filterSearch,
    limit: filterLimit,
  });

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
                onClick={() => void refreshAudit({ lookbackHours: hours })}
                type="button"
              >
                {hours}h
              </button>
            ))}
          </div>
          <span className="queue-status">
            {statusMsg}{' '}
            {audit.window.fromDate || audit.window.toDate
              ? `Periode: ${audit.window.fromDate ?? '...'} au ${audit.window.toDate ?? '...'}.`
              : `Fenetre: ${audit.window.lookbackHours}h.`}
            {audit.window.status ? ` Statut: ${audit.window.status}.` : ''}
          </span>
        </div>
      </div>

      {/* ── Export CSV filter bar ── */}
      <div className="export-filter-bar">
        <span className="export-filter-label">Export CSV</span>

        <input
          className="export-filter-input"
          onChange={(e) => setFilterSearch(e.target.value)}
          placeholder="Nom passager ou chauffeur"
          type="text"
          value={filterSearch}
        />

        <select
          className="export-filter-select"
          onChange={(e) => setFilterStatus(e.target.value)}
          value={filterStatus}
        >
          <option value="">Tous statuts</option>
          <option value="PENDING">En attente</option>
          <option value="MATCHED">Assigne</option>
          <option value="DRIVER_ARRIVING">Chauffeur en route</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="COMPLETED">Termine</option>
          <option value="CANCELLED">Annule</option>
        </select>

        <input
          className="export-filter-input export-filter-date"
          onChange={(e) => setFilterFrom(e.target.value)}
          placeholder="Du (AAAA-MM-JJ)"
          type="date"
          value={filterFrom}
        />
        <input
          className="export-filter-input export-filter-date"
          onChange={(e) => setFilterTo(e.target.value)}
          placeholder="Au (AAAA-MM-JJ)"
          type="date"
          value={filterTo}
        />

        <select
          className="export-filter-select export-filter-limit"
          onChange={(e) => setFilterLimit(resolveTripsAuditLimit(e.target.value))}
          value={filterLimit}
        >
          {tripsAuditLimitOptions.map((limit) => (
            <option key={limit} value={limit}>
              {limit} trajets
            </option>
          ))}
        </select>

        <button
          className="ghost-button"
          disabled={isRefreshing}
          onClick={applyAuditFilters}
          type="button"
        >
          Appliquer a l&apos;audit
        </button>

        <a className="primary-link" download href={exportUrl}>
          Exporter
        </a>
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
          <p>
            {audit.summary.riskTripCount} a traiter,{' '}
            {audit.summary.resolvedRiskTripCount} resolue(s)
          </p>
        </article>
        <article className="card">
          <span>Argent a verifier</span>
          <strong>
            {formatAdminMoney(audit.summary.moneyAtRisk, audit.summary.currency)}
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
              {formatAdminMoney(owner.moneyAtRisk, audit.summary.currency)} a
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
                {formatAdminMoney(trip.fare, trip.currency)}
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
            <div className="trip-risk-resolution">
              <textarea
                aria-label={`Justification de resolution du risque ${trip.id}`}
                onChange={(event) =>
                  setResolutionReasonByTripId((current) => ({
                    ...current,
                    [trip.id]: event.target.value,
                  }))
                }
                placeholder="Justification ops/finance avant cloture"
                rows={3}
                value={resolutionReasonByTripId[trip.id] ?? ''}
              />
              <button
                className="ghost-button"
                disabled={resolvingTripId === trip.id}
                onClick={() => void resolveRisk(trip.id)}
                type="button"
              >
                {resolvingTripId === trip.id
                  ? 'Cloture...'
                  : 'Cloturer le risque'}
              </button>
              {forceClosableTripStatuses.has(trip.status) ? (
                <button
                  className="ghost-button danger"
                  disabled={resolvingTripId === trip.id}
                  onClick={() => void forceCloseTrip(trip.id)}
                  type="button"
                >
                  {resolvingTripId === trip.id
                    ? 'Deblocage...'
                    : 'Debloquer la course'}
                </button>
              ) : null}
            </div>
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
