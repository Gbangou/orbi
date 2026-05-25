'use client';

import { useMemo, useRef, useState } from 'react';
import {
  type AdminRiderStatusResponse,
  type AdminRidersResponse,
} from '@orbi/api';
import {
  createAdminMutationHeaders,
  fetchAdminJson,
} from './admin-client-fetch';
import { formatAdminDateTime } from './admin-ops-kernel';

type RidersBoardProps = {
  initialRiders: AdminRidersResponse;
};

async function fetchRiders(search: string) {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '30',
  });

  if (search.trim()) {
    params.set('search', search.trim());
  }

  return fetchAdminJson<AdminRidersResponse>(`/api/admin/riders?${params}`);
}

async function updateRiderStatus(
  userId: string,
  payload: { isActive: boolean; reason: string },
) {
  return fetchAdminJson<AdminRiderStatusResponse>(
    `/api/admin/riders/${userId}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...createAdminMutationHeaders(),
      },
      body: JSON.stringify(payload),
    },
  );
}

export function RidersBoard({ initialRiders }: RidersBoardProps) {
  const [riders, setRiders] = useState(initialRiders.riders);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Riders synchronises.');
  const [busyRiderId, setBusyRiderId] = useState<string | null>(null);
  const riderStatusInFlightRef = useRef(new Set<string>());

  const summary = useMemo(() => {
    const active = riders.filter((rider) => rider.isActive).length;
    const suspended = riders.length - active;
    const requests = riders.reduce(
      (total, rider) => total + rider.rideRequestsCount,
      0,
    );

    return { active, suspended, requests };
  }, [riders]);

  async function refreshRiders(nextSearch = search) {
    setStatus('Actualisation riders...');

    try {
      const response = await fetchRiders(nextSearch);
      setRiders(response.riders);
      setStatus('Riders actualises.');
    } catch {
      setStatus("Impossible d'actualiser les riders.");
    }
  }

  async function handleStatusChange(userId: string, isActive: boolean) {
    if (riderStatusInFlightRef.current.has(userId)) {
      return;
    }

    riderStatusInFlightRef.current.add(userId);
    setBusyRiderId(userId);
    setStatus(isActive ? 'Reactivation rider...' : 'Suspension rider...');

    try {
      const response = await updateRiderStatus(userId, {
        isActive,
        reason: isActive
          ? 'Reactivation operations depuis la console admin.'
          : 'Suspension operations depuis la console admin.',
      });
      setRiders((current) =>
        current.map((rider) =>
          rider.id === response.riderId
            ? { ...rider, isActive: response.isActive }
            : rider,
        ),
      );
      setStatus(isActive ? 'Rider reactive.' : 'Rider suspendu.');
    } catch {
      setStatus("Le statut rider n'a pas pu etre mis a jour.");
    } finally {
      riderStatusInFlightRef.current.delete(userId);
      setBusyRiderId(null);
    }
  }

  return (
    <section className="panel ops-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Rider Ops</p>
          <h2>Comptes passagers</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Lecture operations des passagers avec suspension/reactivation auditee
            pour traiter fraude, support et abus sans toucher aux comptes
            chauffeurs.
          </p>
          <div className="queue-actions">
            <input
              className="admin-search-input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, email ou telephone"
              value={search}
            />
            <button
              className="ghost-button"
              onClick={() => void refreshRiders()}
              type="button"
            >
              Rechercher
            </button>
            <span className="queue-status">{status}</span>
          </div>
        </div>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>Actifs</span>
          <strong>{summary.active}</strong>
          <p>Comptes passagers autorises</p>
        </article>
        <article className="board-summary-card">
          <span>Suspendus</span>
          <strong>{summary.suspended}</strong>
          <p>Comptes bloques par operations</p>
        </article>
        <article className="board-summary-card">
          <span>Demandes</span>
          <strong>{summary.requests}</strong>
          <p>Reservations rattachees a cette page</p>
        </article>
      </div>

      <div className="ops-table">
        {riders.length ? (
          riders.map((rider) => (
            <article className="ops-row" key={rider.id}>
              <div>
                <h3>{rider.fullName}</h3>
                <p>{rider.email}</p>
                <p>
                  {rider.phoneNumber ?? 'Telephone non renseigne'} - cree le{' '}
                  {formatAdminDateTime(rider.createdAt)}
                </p>
              </div>
              <div className="ops-row-metrics">
                <span
                  className={`phase-status ${
                    rider.isActive
                      ? 'phase-status-completed'
                      : 'phase-status-next'
                  }`}
                >
                  {rider.isActive ? 'Actif' : 'Suspendu'}
                </span>
                <strong>{rider.rideRequestsCount} demandes</strong>
                <span>{rider.completedTripsCount} trajets</span>
              </div>
              <button
                className={rider.isActive ? 'danger-button' : 'ghost-button'}
                disabled={busyRiderId === rider.id}
                onClick={() => void handleStatusChange(rider.id, !rider.isActive)}
                type="button"
              >
                {busyRiderId === rider.id
                  ? 'Mise a jour...'
                  : rider.isActive
                    ? 'Suspendre'
                    : 'Reactiver'}
              </button>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <h3>Aucun rider trouve</h3>
            <p>Modifiez la recherche ou rechargez la file passagers.</p>
          </div>
        )}
      </div>
    </section>
  );
}
