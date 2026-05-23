'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type AdminLiveOpsResponse } from '@orbi/api';
import { describeRealtimeConnection, formatOperationalStatus } from '@orbi/ui';
import {
  adminSyncHighlightDurationMs,
  hasLiveOpsTripChanged,
  resolveCollectionDelta,
  resolveLiveOpsRouteMonitoringCopy,
  resolveLiveOpsTripTriage,
  resolveStringFeedDelta,
} from './admin-ops-kernel';
import { fetchAdminJson } from './admin-client-fetch';
import { subscribeToAdminRealtime } from './admin-realtime';

type LiveOpsBoardProps = {
  initialLiveOps: AdminLiveOpsResponse;
};

async function fetchLiveOps() {
  return fetchAdminJson<AdminLiveOpsResponse>('/api/admin/live-ops');
}

export function LiveOpsBoard({ initialLiveOps }: LiveOpsBoardProps) {
  const [liveOps, setLiveOps] = useState(initialLiveOps);
  const [status, setStatus] = useState(
    'Console live connectee au dernier snapshot backend.',
  );
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [freshTripIds, setFreshTripIds] = useState<string[]>([]);
  const [freshAlerts, setFreshAlerts] = useState<string[]>([]);
  const previousTripsRef = useRef<AdminLiveOpsResponse['trips'] | null>(null);
  const previousAlertsRef = useRef<string[] | null>(null);

  const refreshLiveOps = useCallback(async () => {
    try {
      const response = await fetchLiveOps();
      setLiveOps(response);
      setStatus(describeRealtimeConnection('admin-live-ops', 'connected'));
    } catch {
      setStatus("Le flux live ops n'a pas pu etre rafraichi.");
    }
  }, []);

  useEffect(() => {
    const stream = subscribeToAdminRealtime({
      'trip.created': () => void refreshLiveOps(),
      'trip.updated': () => void refreshLiveOps(),
      'trip.pickup-code-verified': () => void refreshLiveOps(),
      'trip.incident-reported': () => void refreshLiveOps(),
      'trip.route-monitor-alert': () => void refreshLiveOps(),
      'mobile.error-reports-submitted': () => void refreshLiveOps(),
      'driver-onboarding.review-updated': () => void refreshLiveOps(),
      'payment-attempt.provider-verified': () => void refreshLiveOps(),
      'payment-attempt.refund-requested': () => void refreshLiveOps(),
      'payment-attempt.refunded': () => void refreshLiveOps(),
      'ride-request.created': () => void refreshLiveOps(),
      'ride-request.cancelled': () => void refreshLiveOps(),
      heartbeat: () =>
        setStatus(describeRealtimeConnection('admin-live-ops', 'active')),
    });

    stream.onopen = () => {
      setStatus(describeRealtimeConnection('admin-live-ops', 'connected'));
    };

    stream.onerror = () => {
      setStatus(describeRealtimeConnection('admin-live-ops', 'reconnecting'));
    };

    return () => {
      stream.close();
    };
  }, [refreshLiveOps]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshLiveOps();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [refreshLiveOps]);

  useEffect(() => {
    const previousTrips = previousTripsRef.current;

    if (previousTrips) {
      const delta = resolveCollectionDelta(previousTrips, liveOps.trips, {
        getId: (trip) => trip.id,
        hasChanged: hasLiveOpsTripChanged,
      });
      const updatedTrip = liveOps.trips.find((trip) =>
        delta.updatedIds.includes(trip.id),
      );

      if (delta.freshIds.length > 0) {
        setFreshTripIds(delta.freshIds);
        setTransitionLabel(
          delta.freshIds.length > 1
            ? `${delta.freshIds.length} nouveaux trajets viennent d entrer dans la console live.`
            : 'Un nouveau trajet vient d entrer dans la console live.',
        );
      } else if (updatedTrip) {
        setFreshTripIds([updatedTrip.id]);
        setTransitionLabel(
          `Trajet critique resynchronise: ${formatOperationalStatus(updatedTrip.status)}.`,
        );
      } else if (delta.removedIds.length > 0) {
        setTransitionLabel(
          delta.removedIds.length > 1
            ? `${delta.removedIds.length} trajets ont quitte la vue active.`
            : 'Un trajet a quitte la vue active.',
        );
      }
    }

    previousTripsRef.current = liveOps.trips;
  }, [liveOps.trips]);

  useEffect(() => {
    const nextFreshAlerts = resolveStringFeedDelta(
      previousAlertsRef.current,
      liveOps.alerts,
    );

    if (nextFreshAlerts.length > 0) {
      setFreshAlerts(nextFreshAlerts);
    }

    previousAlertsRef.current = liveOps.alerts;
  }, [liveOps.alerts]);

  useEffect(() => {
    if (!transitionLabel) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransitionLabel(null);
    }, adminSyncHighlightDurationMs);

    return () => window.clearTimeout(timeout);
  }, [transitionLabel]);

  useEffect(() => {
    if (!freshTripIds.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFreshTripIds([]);
    }, adminSyncHighlightDurationMs);

    return () => window.clearTimeout(timeout);
  }, [freshTripIds]);

  useEffect(() => {
    if (!freshAlerts.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFreshAlerts([]);
    }, adminSyncHighlightDurationMs);

    return () => window.clearTimeout(timeout);
  }, [freshAlerts]);

  return (
    <section className="panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Live Ops</p>
          <h2>Trajets actifs et timeline terrain</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Les courses en direct remontent maintenant les etapes clefs du cycle
            de trajet pour l equipe operations.
          </p>
          <span className="queue-status">{status}</span>
          {transitionLabel ? (
            <span className="queue-transition">{transitionLabel}</span>
          ) : null}
        </div>
      </div>

      <div className="grid">
        <article className="card">
          <span>En attente pickup</span>
          <strong>{liveOps.summary.tripsByStatus.matched}</strong>
          <p>Trajets en statut MATCHED</p>
        </article>
        <article className="card">
          <span>Chauffeurs arrives</span>
          <strong>{liveOps.summary.tripsByStatus.arriving}</strong>
          <p>Trajets en statut DRIVER_ARRIVING</p>
        </article>
        <article className="card">
          <span>Courses en direct</span>
          <strong>{liveOps.summary.tripsByStatus.inProgress}</strong>
          <p>Trajets en statut IN_PROGRESS</p>
        </article>
        <article className={`card${liveOps.summary.stalledMatchedTrips > 0 ? ' card-alert' : ''}`}>
          <span>SLA MATCHED</span>
          <strong>{liveOps.summary.stalledMatchedTrips}</strong>
          <p>Trajet(s) MATCHED en attente {'>'} 10 min</p>
        </article>
        <article className="card">
          <span>Paiements 24h</span>
          <strong>{liveOps.summary.payments.reconciliationRate}%</strong>
          <p>
            {liveOps.summary.payments.reconciled}/
            {liveOps.summary.payments.attempts} reconciles
          </p>
          <p>
            {liveOps.summary.payments.refunded} rembourses,{' '}
            {liveOps.summary.payments.refundPending} en attente
          </p>
        </article>
        <article className="card">
          <span>Webhooks paiement</span>
          <strong>{liveOps.summary.payments.webhookEvents}</strong>
          <p>
            {liveOps.summary.payments.webhookConflicts} conflits,{' '}
            {liveOps.summary.payments.webhookUnknownReferences} inconnus
          </p>
        </article>
      </div>

      {liveOps.alerts.length ? (
        <div className="ops-alert-strip">
          {liveOps.alerts.map((alert) => (
            <span
              className={`ops-alert-pill ${
                freshAlerts.includes(alert) ? 'ops-alert-pill-fresh' : ''
              }`}
              key={alert}
            >
              {alert}
            </span>
          ))}
        </div>
      ) : null}

      <div className="roadmap-grid live-ops-grid">
        {liveOps.trips.map((trip) => {
          const routeMonitoringCopy = resolveLiveOpsRouteMonitoringCopy(
            trip.routeMonitoring,
          );
          const triage = resolveLiveOpsTripTriage(trip);
          const completionGate = trip.completionGate ?? {
            label: 'Finalisation possible',
            reason: 'Signal route a confirmer.',
            canOpsOverride: false,
          };

          return (
            <article
              className={`phase-card live-trip-card ${
                freshTripIds.includes(trip.id) ? 'phase-card-fresh' : ''
              }`}
              key={trip.id}
            >
              {freshTripIds.includes(trip.id) ? (
                <span className="entity-transition-badge">Resync live</span>
              ) : null}
              <div className="ticket-topline">
                <span className="phase-status phase-status-next">
                  {formatOperationalStatus(trip.status)}
                </span>
                <span className="live-trip-fare">
                  {trip.currency} {trip.fare}
                </span>
              </div>
              <h3>{trip.route}</h3>
              <p>
                {trip.riderName} avec {trip.driverName} - {trip.vehicleLabel}
              </p>
              <div
                className={`live-trip-triage live-trip-triage-${triage.level}`}
              >
                <span>{triage.label}</span>
                <strong>{triage.owner}</strong>
                <p>{triage.action}</p>
              </div>
              <p>
                Dernier evenement:{' '}
                {trip.lastEvent
                  ? `${trip.lastEvent.label} a ${new Date(
                      trip.lastEvent.createdAt,
                    ).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Aucun evenement'}
              </p>
              <div className="trip-meta-grid">
                <div className="trip-meta-card">
                  <span>Pickup code</span>
                  <strong>
                    {trip.pickupCodeIssued ? 'Emis' : 'Non emis'}
                  </strong>
                </div>
                <div className="trip-meta-card">
                  <span>Incidents</span>
                  <strong>
                    {trip.hasIncident
                      ? `${trip.incidentCount} signalement(s)`
                      : 'Aucun'}
                  </strong>
                </div>
                <div className="trip-meta-card">
                  <span>Route monitoring</span>
                  <strong>{routeMonitoringCopy.statusLabel}</strong>
                  {routeMonitoringCopy.lastSignalLabel ? (
                    <small>{routeMonitoringCopy.lastSignalLabel}</small>
                  ) : null}
                  {routeMonitoringCopy.progressLabel ? (
                    <small>{routeMonitoringCopy.progressLabel}</small>
                  ) : null}
                </div>
                <div className="trip-meta-card">
                  <span>Finalisation</span>
                  <strong>{completionGate.label}</strong>
                  <small>{completionGate.reason}</small>
                  {completionGate.canOpsOverride ? (
                    <small>Resolution ops auditee requise</small>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
        {!liveOps.trips.length ? (
          <article className="phase-card">
            <span className="phase-status phase-status-planned">stable</span>
            <h3>Aucun trajet actif</h3>
            <p>
              La console operations ne detecte pas de course active pour le
              moment.
            </p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
