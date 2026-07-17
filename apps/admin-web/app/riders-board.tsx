'use client';

import { useMemo, useRef, useState } from 'react';
import {
  type AdminRiderProfileRepairResponse,
  type AdminRiderStatusResponse,
  type AdminRidersResponse,
  type AdminUserAuthUnlockResponse,
} from '@orbi/api';
import {
  createAdminMutationHeaders,
  fetchAdminJson,
} from './admin-client-fetch';
import { formatAdminDateTime } from './admin-ops-kernel';

type RidersBoardProps = {
  initialRiders: AdminRidersResponse;
};

const RIDER_PROFILE_STATUS_LABELS: Record<
  AdminRidersResponse['riders'][number]['profileStatus'],
  string
> = {
  READY: 'Profil OK',
  MISSING_PROFILE: 'Profil manquant',
};

const RIDER_PROFILE_STATUS_CSS: Record<
  AdminRidersResponse['riders'][number]['profileStatus'],
  string
> = {
  READY: 'phase-status-completed',
  MISSING_PROFILE: 'phase-status-next',
};

const RIDER_AUTH_STATUS_LABELS: Record<
  AdminRidersResponse['riders'][number]['authStatus'],
  string
> = {
  READY: 'Login OK',
  LOCKED: 'Login bloque',
  FAILED_ATTEMPTS: 'Tentatives ratees',
};

const RIDER_AUTH_STATUS_CSS: Record<
  AdminRidersResponse['riders'][number]['authStatus'],
  string
> = {
  READY: 'phase-status-completed',
  LOCKED: 'phase-status-next',
  FAILED_ATTEMPTS: 'phase-status-planned',
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

async function repairRiderProfile(userId: string) {
  return fetchAdminJson<AdminRiderProfileRepairResponse>(
    `/api/admin/riders/${userId}/profile/repair`,
    {
      method: 'PATCH',
      headers: createAdminMutationHeaders(),
    },
  );
}

async function unlockUserAuth(userId: string) {
  return fetchAdminJson<AdminUserAuthUnlockResponse>(
    `/api/admin/users/${userId}/auth/unlock`,
    {
      method: 'PATCH',
      headers: createAdminMutationHeaders(),
    },
  );
}

export function RidersBoard({ initialRiders }: RidersBoardProps) {
  const [riders, setRiders] = useState(initialRiders.riders);
  const [totalRiders, setTotalRiders] = useState(initialRiders.total);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Passagers synchronises.');
  const [busyRiderId, setBusyRiderId] = useState<string | null>(null);
  const riderStatusInFlightRef = useRef(new Set<string>());

  const summary = useMemo(() => {
    const active = riders.filter((rider) => rider.isActive).length;
    const suspended = riders.length - active;
    const missingProfiles = riders.filter(
      (rider) => rider.profileStatus === 'MISSING_PROFILE',
    ).length;
    const authIssues = riders.filter(
      (rider) => rider.authStatus !== 'READY',
    ).length;
    const requests = riders.reduce(
      (total, rider) => total + rider.rideRequestsCount,
      0,
    );

    return { active, suspended, missingProfiles, authIssues, requests };
  }, [riders]);

  async function refreshRiders(nextSearch = search) {
    setStatus('Actualisation passagers...');

    try {
      const response = await fetchRiders(nextSearch);
      setRiders(response.riders);
      setTotalRiders(response.total);
      setStatus('Passagers actualises.');
    } catch {
      setStatus("Impossible d'actualiser les passagers.");
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

  async function handleRepairProfile(userId: string) {
    if (riderStatusInFlightRef.current.has(userId)) {
      return;
    }

    riderStatusInFlightRef.current.add(userId);
    setBusyRiderId(userId);
    setStatus('Reparation profil passager...');

    try {
      const response = await repairRiderProfile(userId);
      setRiders((current) =>
        current.map((rider) =>
          rider.id === response.rider.id ? response.rider : rider,
        ),
      );
      setStatus(
        response.repaired
          ? 'Profil passager repare.'
          : 'Profil passager deja pret.',
      );
    } catch {
      setStatus("Le profil passager n'a pas pu etre repare.");
    } finally {
      riderStatusInFlightRef.current.delete(userId);
      setBusyRiderId(null);
    }
  }

  async function handleUnlockAuth(userId: string) {
    if (riderStatusInFlightRef.current.has(userId)) {
      return;
    }

    riderStatusInFlightRef.current.add(userId);
    setBusyRiderId(userId);
    setStatus('Deblocage login passager...');

    try {
      const response = await unlockUserAuth(userId);
      setRiders((current) =>
        current.map((rider) =>
          rider.id === response.userId
            ? {
                ...rider,
                authStatus: 'READY',
                failedLoginCount: response.failedLoginCount,
                lockedUntil: response.lockedUntil,
              }
            : rider,
        ),
      );
      setStatus(
        response.unlocked ? 'Login passager debloque.' : 'Login deja ouvert.',
      );
    } catch {
      setStatus("Le login passager n'a pas pu etre debloque.");
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
          <span>Total</span>
          <strong>{totalRiders}</strong>
          <p>Passagers visibles dans la base active</p>
        </article>
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
          <span>Profils manquants</span>
          <strong>{summary.missingProfiles}</strong>
          <p>Comptes a reparer avant test reel</p>
        </article>
        <article className="board-summary-card">
          <span>Logins a verifier</span>
          <strong>{summary.authIssues}</strong>
          <p>Comptes verrouilles ou tentatives ratees</p>
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
                <p>
                  Derniere connexion:{' '}
                  {rider.lastLoginAt
                    ? formatAdminDateTime(rider.lastLoginAt)
                    : 'jamais vue'}
                </p>
                <p>ID profil: {rider.riderId ?? 'aucun profil rattache'}</p>
                <p>
                  Login: {rider.failedLoginCount} echec(s)
                  {rider.lockedUntil
                    ? ` - bloque jusqu'au ${formatAdminDateTime(
                        rider.lockedUntil,
                      )}`
                    : ''}
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
                <span
                  className={`phase-status ${
                    RIDER_PROFILE_STATUS_CSS[rider.profileStatus]
                  }`}
                >
                  {RIDER_PROFILE_STATUS_LABELS[rider.profileStatus]}
                </span>
                <span
                  className={`phase-status ${
                    RIDER_AUTH_STATUS_CSS[rider.authStatus]
                  }`}
                >
                  {RIDER_AUTH_STATUS_LABELS[rider.authStatus]}
                </span>
                <strong>{rider.rideRequestsCount} demandes</strong>
                <span>{rider.completedTripsCount} trajets</span>
              </div>
              <div className="ops-row-actions">
                {rider.profileStatus === 'MISSING_PROFILE' ? (
                  <button
                    className="ghost-button"
                    disabled={busyRiderId === rider.id}
                    onClick={() => void handleRepairProfile(rider.id)}
                    type="button"
                  >
                    {busyRiderId === rider.id
                      ? 'Reparation...'
                      : 'Reparer profil'}
                  </button>
                ) : null}
                {rider.authStatus !== 'READY' ? (
                  <button
                    className="ghost-button"
                    disabled={busyRiderId === rider.id}
                    onClick={() => void handleUnlockAuth(rider.id)}
                    type="button"
                  >
                    {busyRiderId === rider.id
                      ? 'Deblocage...'
                      : 'Debloquer login'}
                  </button>
                ) : null}
                <button
                  className={rider.isActive ? 'danger-button' : 'ghost-button'}
                  disabled={busyRiderId === rider.id}
                  onClick={() =>
                    void handleStatusChange(rider.id, !rider.isActive)
                  }
                  type="button"
                >
                  {busyRiderId === rider.id
                    ? 'Mise a jour...'
                    : rider.isActive
                      ? 'Suspendre'
                      : 'Reactiver'}
                </button>
              </div>
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
