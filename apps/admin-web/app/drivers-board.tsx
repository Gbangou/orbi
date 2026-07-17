"use client";

import { useMemo, useRef, useState } from "react";
import {
  type AdminDriverProfileRepairResponse,
  type AdminDriversResponse,
} from "@orbi/api";
import {
  createAdminMutationHeaders,
  fetchAdminJson,
} from "./admin-client-fetch";
import { formatAdminDateTime } from "./admin-ops-kernel";

type DriversBoardProps = {
  initialDrivers: AdminDriversResponse;
};

async function fetchDrivers(search: string, status: string) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "30",
  });

  if (search.trim()) {
    params.set("search", search.trim());
  }

  if (status && status !== "ALL") {
    params.set("status", status);
  }

  return fetchAdminJson<AdminDriversResponse>(`/api/admin/drivers?${params}`);
}

async function suspendDriver(driverId: string, reason: string) {
  return fetchAdminJson<{ driverId: string; status: string }>(
    `/api/admin/drivers/${driverId}/suspend`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createAdminMutationHeaders(),
      },
      body: JSON.stringify({ reason }),
    },
  );
}

async function reactivateDriver(driverId: string) {
  return fetchAdminJson<{ driverId: string; status: string }>(
    `/api/admin/drivers/${driverId}/reactivate`,
    {
      method: "POST",
      headers: createAdminMutationHeaders(),
    },
  );
}

async function repairDriverProfile(userId: string) {
  return fetchAdminJson<AdminDriverProfileRepairResponse>(
    `/api/admin/drivers/${userId}/profile/repair`,
    {
      method: "PATCH",
      headers: createAdminMutationHeaders(),
    },
  );
}

const DRIVER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  PENDING: "En attente",
  SUSPENDED: "Suspendu",
  REJECTED: "Rejete",
  MISSING_PROFILE: "Profil manquant",
};

const DRIVER_STATUS_CSS: Record<string, string> = {
  ACTIVE: "phase-status-completed",
  PENDING: "phase-status-next",
  SUSPENDED: "phase-status-next",
  REJECTED: "phase-status-blocked",
  MISSING_PROFILE: "phase-status-next",
};

const DRIVER_PROFILE_STATUS_LABELS: Record<
  AdminDriversResponse["drivers"][number]["profileStatus"],
  string
> = {
  READY: "Profil OK",
  MISSING_PROFILE: "Profil manquant",
};

const DRIVER_PROFILE_STATUS_CSS: Record<
  AdminDriversResponse["drivers"][number]["profileStatus"],
  string
> = {
  READY: "phase-status-completed",
  MISSING_PROFILE: "phase-status-next",
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "Tous les statuts" },
  { value: "ACTIVE", label: "Actifs" },
  { value: "PENDING", label: "En attente" },
  { value: "SUSPENDED", label: "Suspendus" },
  { value: "REJECTED", label: "Rejetes" },
];

export function DriversBoard({ initialDrivers }: DriversBoardProps) {
  const [drivers, setDrivers] = useState(initialDrivers.drivers);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [status, setStatus] = useState("Chauffeurs synchronises.");
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [confirmingDriverId, setConfirmingDriverId] = useState<string | null>(
    null,
  );
  const inFlightRef = useRef(new Set<string>());

  const summary = useMemo(() => {
    // "status" est la presence en direct (OFFLINE/ONLINE/BUSY/SUSPENDED),
    // "verificationStatus" est le cycle de vie du dossier (PENDING/APPROVED/
    // REJECTED) — les deux etaient confondus ici (Actifs/En attente
    // cherchaient des valeurs de "status" qui n'existent jamais), faisant
    // afficher 0 en permanence sur ces deux tuiles.
    const active = drivers.filter(
      (d) => d.verificationStatus === "APPROVED" && d.status !== "SUSPENDED",
    ).length;
    const pending = drivers.filter(
      (d) => d.verificationStatus === "PENDING",
    ).length;
    const suspended = drivers.filter((d) => d.status === "SUSPENDED").length;
    const missingProfiles = drivers.filter(
      (d) => d.profileStatus === "MISSING_PROFILE",
    ).length;
    const trips = drivers.reduce((t, d) => t + d.completedTripsCount, 0);

    return { active, pending, suspended, missingProfiles, trips };
  }, [drivers]);

  async function refreshDrivers(
    nextSearch = search,
    nextStatus = statusFilter,
  ) {
    setStatus("Actualisation chauffeurs...");

    try {
      const response = await fetchDrivers(nextSearch, nextStatus);
      setDrivers(response.drivers);
      setStatus("Chauffeurs actualises.");
    } catch {
      setStatus("Impossible d'actualiser les chauffeurs.");
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value);
    void refreshDrivers(search, value);
  }

  async function handleSuspend(driverId: string) {
    if (inFlightRef.current.has(driverId)) return;

    const reason = suspendReason.trim();

    if (reason.length < 10) {
      setStatus(
        "La raison de suspension doit contenir au moins 10 caracteres.",
      );
      return;
    }

    inFlightRef.current.add(driverId);
    setBusyDriverId(driverId);
    setStatus("Suspension chauffeur...");

    try {
      const response = await suspendDriver(driverId, reason);
      setDrivers((current) =>
        current.map((d) =>
          d.id === response.driverId ? { ...d, status: response.status } : d,
        ),
      );
      setStatus("Chauffeur suspendu.");
      setConfirmingDriverId(null);
      setSuspendReason("");
    } catch {
      setStatus("Le statut chauffeur n'a pas pu etre mis a jour.");
    } finally {
      inFlightRef.current.delete(driverId);
      setBusyDriverId(null);
    }
  }

  async function handleReactivate(driverId: string) {
    if (inFlightRef.current.has(driverId)) return;

    inFlightRef.current.add(driverId);
    setBusyDriverId(driverId);
    setStatus("Reactivation chauffeur...");

    try {
      const response = await reactivateDriver(driverId);
      setDrivers((current) =>
        current.map((d) =>
          d.id === response.driverId ? { ...d, status: response.status } : d,
        ),
      );
      setStatus("Chauffeur reactive.");
    } catch {
      setStatus("Le statut chauffeur n'a pas pu etre mis a jour.");
    } finally {
      inFlightRef.current.delete(driverId);
      setBusyDriverId(null);
    }
  }

  async function handleRepairProfile(userId: string) {
    if (inFlightRef.current.has(userId)) return;

    inFlightRef.current.add(userId);
    setBusyDriverId(userId);
    setStatus("Reparation profil chauffeur...");

    try {
      const response = await repairDriverProfile(userId);
      setDrivers((current) =>
        current.map((driver) =>
          driver.userId === response.driver.userId ? response.driver : driver,
        ),
      );
      setStatus(
        response.repaired
          ? "Profil chauffeur repare."
          : "Profil chauffeur deja pret.",
      );
    } catch {
      setStatus("Le profil chauffeur n'a pas pu etre repare.");
    } finally {
      inFlightRef.current.delete(userId);
      setBusyDriverId(null);
    }
  }

  return (
    <section className="panel ops-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Driver Ops</p>
          <h2>Comptes chauffeurs</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Gestion des comptes chauffeurs avec suspension/reactivation auditee.
            Utilisez les filtres pour cibler les chauffeurs en attente ou
            suspendus.
          </p>
          <div className="queue-actions">
            <input
              className="admin-search-input"
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Nom, email ou telephone"
              value={search}
            />
            <select
              className="admin-search-input"
              onChange={(event) => handleStatusFilterChange(event.target.value)}
              value={statusFilter}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              className="ghost-button"
              onClick={() => void refreshDrivers()}
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
          <p>Chauffeurs operationnels</p>
        </article>
        <article className="board-summary-card">
          <span>En attente</span>
          <strong>{summary.pending}</strong>
          <p>Onboarding en cours</p>
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
          <span>Trajets</span>
          <strong>{summary.trips}</strong>
          <p>Courses effectuees sur cette page</p>
        </article>
      </div>

      <div className="ops-table">
        {drivers.length ? (
          drivers.map((driver) => (
            <article className="ops-row" key={driver.id}>
              <div>
                <h3>{driver.fullName}</h3>
                <p>{driver.email}</p>
                <p>
                  {driver.phoneNumber ?? "Telephone non renseigne"} - cree le{" "}
                  {formatAdminDateTime(driver.createdAt)}
                </p>
                <p>
                  Derniere connexion:{" "}
                  {driver.lastLoginAt
                    ? formatAdminDateTime(driver.lastLoginAt)
                    : "jamais vue"}
                </p>
                <p>ID profil: {driver.driverId ?? "aucun profil rattache"}</p>
                {driver.vehicle ? (
                  <p className="ops-row-sub">
                    {driver.vehicle.vehicleType === "MOTORCYCLE"
                      ? "Moto"
                      : "Voiture"}{" "}
                    · {driver.vehicle.make} {driver.vehicle.model} ·{" "}
                    {driver.vehicle.plateNumber}
                  </p>
                ) : (
                  <p className="ops-row-sub">Vehicule non enregistre</p>
                )}
              </div>
              <div className="ops-row-metrics">
                <span
                  className={`phase-status ${
                    DRIVER_STATUS_CSS[driver.status] ?? "phase-status-next"
                  }`}
                >
                  {DRIVER_STATUS_LABELS[driver.status] ?? driver.status}
                </span>
                <span
                  className={`phase-status ${
                    DRIVER_PROFILE_STATUS_CSS[driver.profileStatus]
                  }`}
                >
                  {DRIVER_PROFILE_STATUS_LABELS[driver.profileStatus]}
                </span>
                <strong>{driver.completedTripsCount} trajets</strong>
              </div>
              <div className="ops-row-actions">
                {driver.profileStatus === "MISSING_PROFILE" && (
                  <button
                    className="ghost-button"
                    disabled={busyDriverId === driver.userId}
                    onClick={() => void handleRepairProfile(driver.userId)}
                    type="button"
                  >
                    {busyDriverId === driver.userId
                      ? "Reparation..."
                      : "Reparer profil"}
                  </button>
                )}
                {driver.status === "ACTIVE" && (
                  <>
                    {confirmingDriverId === driver.id ? (
                      <div className="suspend-confirm">
                        <input
                          className="admin-search-input"
                          minLength={10}
                          onChange={(e) => setSuspendReason(e.target.value)}
                          placeholder="Raison (min 10 caracteres)"
                          value={suspendReason}
                        />
                        <button
                          className="danger-button"
                          disabled={
                            busyDriverId === driver.id ||
                            suspendReason.trim().length < 10
                          }
                          onClick={() => void handleSuspend(driver.id)}
                          type="button"
                        >
                          {busyDriverId === driver.id
                            ? "Mise a jour..."
                            : "Confirmer suspension"}
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() => {
                            setConfirmingDriverId(null);
                            setSuspendReason("");
                          }}
                          type="button"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        className="danger-button"
                        disabled={busyDriverId === driver.id}
                        onClick={() => setConfirmingDriverId(driver.id)}
                        type="button"
                      >
                        Suspendre
                      </button>
                    )}
                  </>
                )}
                {driver.status === "SUSPENDED" && (
                  <button
                    className="ghost-button"
                    disabled={busyDriverId === driver.id}
                    onClick={() => void handleReactivate(driver.id)}
                    type="button"
                  >
                    {busyDriverId === driver.id
                      ? "Mise a jour..."
                      : "Reactiver"}
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <h3>Aucun chauffeur trouve</h3>
            <p>Modifiez la recherche ou rechargez la liste des chauffeurs.</p>
          </div>
        )}
      </div>
    </section>
  );
}
