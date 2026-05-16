'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type DriverOnboardingExportHistoryResponse,
  type DriverOnboardingQueueResponse,
  type DriverDocumentObjectVerificationResponse,
  type DriverDocumentViewLinkResponse,
  type DriverOnboardingReviewUpdateResponse,
} from '@mobilis/api';
import { describeRealtimeConnection } from '@mobilis/ui';
import {
  adminSyncHighlightDurationMs,
  formatAdminDateTime,
  resolveDriverOnboardingDelta,
  resolveVisibleDriverOnboardingQueue,
  type DriverOnboardingGuidanceFilter,
} from './admin-ops-kernel';
import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
} from './admin-server-security';
import { subscribeToAdminRealtime } from './admin-realtime';
import { resolveSafeDocumentUrl } from './admin-url-security';

type DriverOnboardingReviewBoardProps = {
  initialQueue: DriverOnboardingQueueResponse['drivers'];
};

const reviewActions = [
  {
    label: 'Prendre en revue',
    status: 'UNDER_REVIEW' as const,
    className: 'ticket-button ticket-button-neutral',
  },
  {
    label: 'Approuver',
    status: 'APPROVED' as const,
    className: 'ticket-button ticket-button-success',
  },
  {
    label: 'Corrections',
    status: 'CHANGES_REQUESTED' as const,
    className: 'ticket-button ticket-button-danger',
  },
];

const guidanceFilters: Array<{
  label: string;
  value: DriverOnboardingGuidanceFilter;
  level?: 'approve' | 'review' | 'resubmit';
}> = [
  {
    label: 'Tous',
    value: 'all',
  },
  {
    label: 'Prets',
    value: 'approve',
    level: 'approve',
  },
  {
    label: 'Revue',
    value: 'review',
    level: 'review',
  },
  {
    label: 'Redemande',
    value: 'resubmit',
    level: 'resubmit',
  },
];

function getReviewToneClass(status: string) {
  if (status === 'APPROVED') {
    return 'phase-status-completed';
  }

  if (status === 'CHANGES_REQUESTED') {
    return 'phase-status-next';
  }

  return 'phase-status-planned';
}

function getIntegrityToneClass(state: string) {
  if (state === 'complete') {
    return 'phase-status-completed';
  }

  if (state === 'partial') {
    return 'phase-status-next';
  }

  return 'phase-status-planned';
}

function getGuidanceClass(level: string) {
  if (level === 'clear') {
    return 'document-guidance-clear';
  }

  if (level === 'resubmit') {
    return 'document-guidance-resubmit';
  }

  return 'document-guidance-review';
}

function getDecisionGuidanceClass(level: string) {
  if (level === 'approve') {
    return 'decision-guidance-approve';
  }

  if (level === 'resubmit') {
    return 'decision-guidance-resubmit';
  }

  return 'decision-guidance-review';
}

function formatDocumentSize(sizeBytes: number | null) {
  if (!sizeBytes) {
    return 'taille non declaree';
  }

  if (sizeBytes >= 1_000_000) {
    return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
  }

  return `${Math.round(sizeBytes / 1_000)} KB`;
}

function formatShaPreview(sha256: string | null) {
  return sha256 ? `${sha256.slice(0, 10)}...${sha256.slice(-6)}` : 'hash absent';
}

function formatReviewDate(value: string) {
  return formatAdminDateTime(value, 'Date indisponible', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatExportFilterLabel(
  value: DriverOnboardingExportHistoryResponse['exports'][number]['guidanceFilter'],
) {
  const labels = {
    all: 'Tous',
    approve: 'Prets',
    review: 'Revue',
    resubmit: 'Redemande',
  } as const;

  return labels[value];
}

async function fetchDriverOnboardingQueue() {
  const response = await fetch('/api/admin/driver-onboarding-queue', {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Driver onboarding queue fetch failed');
  }

  return (await response.json()) as DriverOnboardingQueueResponse;
}

async function fetchDriverOnboardingExportHistory() {
  const response = await fetch(
    '/api/admin/driver-onboarding/export-history?page=1&pageSize=6',
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error('Driver onboarding export history fetch failed');
  }

  return (await response.json()) as DriverOnboardingExportHistoryResponse;
}

async function fetchDriverOnboardingExportCsv(query: {
  guidanceFilter: DriverOnboardingGuidanceFilter;
  searchQuery?: string;
  limit: number;
}) {
  const params = new URLSearchParams({
    guidanceFilter: query.guidanceFilter,
    limit: String(query.limit),
  });

  if (query.searchQuery) {
    params.set('searchQuery', query.searchQuery);
  }

  const response = await fetch(
    `/api/admin/driver-onboarding/export.csv?${params.toString()}`,
    {
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Driver onboarding CSV export failed');
  }

  return response.text();
}

async function updateDriverOnboardingReview(
  driverId: string,
  payload: {
    status: 'UNDER_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED';
    decisionReason: string;
    supportPriority: number;
    documentDecisions?: Array<{
      documentId: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
    }>;
  },
) {
  const response = await fetch(`/api/admin/driver-onboarding/${driverId}/review`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      [adminMutationHeaderName]: adminMutationHeaderValue,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Driver onboarding review update failed');
  }

  return (await response.json()) as DriverOnboardingReviewUpdateResponse;
}

async function fetchDriverDocumentViewLink(
  driverId: string,
  documentId: string,
) {
  const response = await fetch(
    `/api/admin/driver-onboarding/${driverId}/documents/${documentId}/view-link`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error('Driver document view link fetch failed');
  }

  return (await response.json()) as DriverDocumentViewLinkResponse;
}

async function verifyDriverDocumentObjectWithProvider(
  driverId: string,
  documentId: string,
) {
  const response = await fetch(
    `/api/admin/driver-onboarding/${driverId}/documents/${documentId}/object-verification/verify-provider`,
    {
      method: 'POST',
      headers: {
        [adminMutationHeaderName]: adminMutationHeaderValue,
      },
    },
  );

  if (!response.ok) {
    throw new Error('Driver document object verification failed');
  }

  return (await response.json()) as DriverDocumentObjectVerificationResponse;
}

export function DriverOnboardingReviewBoard({
  initialQueue,
}: DriverOnboardingReviewBoardProps) {
  const [drivers, setDrivers] = useState(initialQueue);
  const [exportHistory, setExportHistory] = useState<
    DriverOnboardingExportHistoryResponse['exports']
  >([]);
  const [status, setStatus] = useState('File onboarding synchronisee.');
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [documentLinks, setDocumentLinks] = useState<Record<string, string>>({});
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [freshDriverIds, setFreshDriverIds] = useState<string[]>([]);
  const [freshDocumentIds, setFreshDocumentIds] = useState<string[]>([]);
  const [guidanceFilter, setGuidanceFilter] =
    useState<DriverOnboardingGuidanceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const previousDriversRef =
    useRef<DriverOnboardingReviewBoardProps['initialQueue'] | null>(null);

  const refreshQueue = useCallback(
    async (message = 'File onboarding actualisee.') => {
      try {
        const response = await fetchDriverOnboardingQueue();
        setDrivers(response.drivers);
        setStatus(message);
      } catch {
        setStatus("Impossible d'actualiser la file onboarding.");
      }
    },
    [],
  );

  const refreshExportHistory = useCallback(async () => {
    try {
      const response = await fetchDriverOnboardingExportHistory();
      setExportHistory(response.exports);
    } catch {
      setExportHistory([]);
    }
  }, []);

  const summary = useMemo(() => {
    const approved = drivers.filter(
      (driver) => driver.reviewStatus === 'APPROVED',
    ).length;
    const underReview = drivers.filter(
      (driver) => driver.reviewStatus === 'UNDER_REVIEW',
    ).length;
    const changesRequested = drivers.filter(
      (driver) => driver.reviewStatus === 'CHANGES_REQUESTED',
    ).length;
    const pendingDocuments = drivers.reduce(
      (total, driver) => total + driver.documentSummary.pending,
      0,
    );
    const integrityWarnings = drivers.reduce(
      (total, driver) => total + driver.documentSummary.integrityWarnings,
      0,
    );
    const readyToApprove = drivers.filter(
      (driver) => driver.decisionGuidance.level === 'approve',
    ).length;
    const reviewRecommended = drivers.filter(
      (driver) => driver.decisionGuidance.level === 'review',
    ).length;
    const resubmitRecommended = drivers.filter(
      (driver) => driver.decisionGuidance.level === 'resubmit',
    ).length;

    return {
      approved,
      underReview,
      changesRequested,
      pendingDocuments,
      integrityWarnings,
      readyToApprove,
      reviewRecommended,
      resubmitRecommended,
    };
  }, [drivers]);

  const visibleDrivers = useMemo(() => {
    return resolveVisibleDriverOnboardingQueue(drivers, {
      guidanceFilter,
      searchQuery,
    });
  }, [drivers, guidanceFilter, searchQuery]);

  useEffect(() => {
    const stream = subscribeToAdminRealtime({
      'driver-onboarding.review-updated': () =>
        void refreshQueue('Revue onboarding synchronisee apres decision ops.'),
      heartbeat: () =>
        setStatus(describeRealtimeConnection('admin-onboarding', 'active')),
    });

    stream.onopen = () => {
      setStatus(describeRealtimeConnection('admin-onboarding', 'connected'));
    };

    stream.onerror = () => {
      setStatus(describeRealtimeConnection('admin-onboarding', 'reconnecting'));
    };

    return () => stream.close();
  }, [refreshQueue]);

  useEffect(() => {
    void refreshExportHistory();
  }, [refreshExportHistory]);

  useEffect(() => {
    const delta = resolveDriverOnboardingDelta(
      previousDriversRef.current,
      drivers,
    );

    if (delta.highlightedDriverIds.length > 0) {
      setFreshDriverIds(delta.highlightedDriverIds);
    }

    if (delta.freshDocumentIds.length > 0) {
      setFreshDocumentIds(delta.freshDocumentIds);
    }

    if (delta.transitionLabel) {
      setTransitionLabel(delta.transitionLabel);
    }

    previousDriversRef.current = drivers;
  }, [drivers]);

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
    if (!freshDriverIds.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFreshDriverIds([]);
    }, adminSyncHighlightDurationMs);

    return () => window.clearTimeout(timeout);
  }, [freshDriverIds]);

  useEffect(() => {
    if (!freshDocumentIds.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFreshDocumentIds([]);
    }, adminSyncHighlightDurationMs);

    return () => window.clearTimeout(timeout);
  }, [freshDocumentIds]);

  async function handleReviewAction(
    driverId: string,
    decision: 'UNDER_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    setBusyDriverId(driverId);
    setStatus('Mise a jour de la decision ops...');

    try {
      const driver = drivers.find((candidate) => candidate.id === driverId);
      await updateDriverOnboardingReview(driverId, {
        status: decision,
        decisionReason:
          decision === 'APPROVED'
            ? 'Dossier valide et coherent.'
            : decision === 'UNDER_REVIEW'
              ? 'Le dossier passe en revue operations.'
              : 'Des justificatifs complementaires sont demandes.',
        supportPriority: decision === 'APPROVED' ? 1 : 2,
        documentDecisions: driver?.documents.map((document) => ({
          documentId: document.id,
          status:
            decision === 'APPROVED'
              ? 'APPROVED'
              : decision === 'CHANGES_REQUESTED'
                ? document.status === 'APPROVED'
                  ? 'APPROVED'
                  : 'PENDING'
                : document.status,
        })),
      });
      await refreshQueue('Decision onboarding appliquee avec succes.');
    } catch {
      setStatus("La decision onboarding n'a pas pu etre appliquee.");
    } finally {
      setBusyDriverId(null);
    }
  }

  async function handleViewDocument(driverId: string, documentId: string) {
    if (documentLinks[documentId]) {
      setStatus('Lien deja genere et pret a etre ouvert.');
      return;
    }

    setBusyDocumentId(documentId);
    setStatus('Generation du lien signe...');

    try {
      const response = await fetchDriverDocumentViewLink(driverId, documentId);
      const signedUrl = resolveSafeDocumentUrl(response.signedUrl);

      if (!signedUrl) {
        setStatus('Lien signe refuse: URL document inattendue.');
        return;
      }

      setDocumentLinks((current) => ({
        ...current,
        [documentId]: signedUrl,
      }));
      setStatus('Lien signe genere.');
    } catch {
      setStatus("Impossible de generer le lien signe du justificatif.");
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function handleVerifyDocumentObject(driverId: string, documentId: string) {
    setBusyDocumentId(documentId);
    setStatus('Verification provider du justificatif...');

    try {
      const response = await verifyDriverDocumentObjectWithProvider(
        driverId,
        documentId,
      );
      await refreshQueue(
        response.document.objectVerification.state === 'confirmed'
          ? 'Objet provider confirme pour le justificatif.'
          : 'Verification provider echouee, dossier remis en revue.',
      );
    } catch {
      setStatus('La verification provider du justificatif a echoue.');
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function handleExportCsv() {
    setStatus('Generation export CSV audite...');

    try {
      const csv = await fetchDriverOnboardingExportCsv({
        guidanceFilter,
        searchQuery: searchQuery.trim() || undefined,
        limit: 100,
      });
      const exportedRows = Math.max(
        csv.split('\n').filter(Boolean).length - 1,
        0,
      );
      const blob = new Blob([`\uFEFF${csv}`], {
        type: 'text/csv;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);

      link.href = url;
      link.download = `mobilis-onboarding-${guidanceFilter}-${date}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(`Export CSV genere pour ${exportedRows} dossier(s).`);
      await refreshExportHistory();
    } catch {
      setStatus("L export CSV onboarding n a pas pu etre genere.");
    }
  }

  return (
    <section className="panel ops-panel onboarding-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Driver Trust Ops</p>
          <h2>Revue onboarding chauffeur</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            File de revue unifiee pour les chauffeurs moto et voiture avec
            documents, decision ops et liens signes de consultation.
          </p>
          <div className="queue-actions">
            <button
              className="ghost-button"
              onClick={() => void refreshQueue()}
              type="button"
            >
              Actualiser
            </button>
            <span className="queue-status">{status}</span>
            {transitionLabel ? (
              <span className="queue-transition">{transitionLabel}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>En revue</span>
          <strong>{summary.underReview}</strong>
          <p>Dossiers actuellement actifs dans la file ops</p>
        </article>
        <article className="board-summary-card">
          <span>Approuves</span>
          <strong>{summary.approved}</strong>
          <p>Dossiers valides et activables</p>
        </article>
        <article className="board-summary-card">
          <span>Corrections</span>
          <strong>{summary.changesRequested}</strong>
          <p>Dossiers renvoyes pour pieces complementaires</p>
        </article>
        <article className="board-summary-card">
          <span>Documents en attente</span>
          <strong>{summary.pendingDocuments}</strong>
          <p>Justificatifs encore non approuves</p>
        </article>
        <article className="board-summary-card">
          <span>Integrite a verifier</span>
          <strong>{summary.integrityWarnings}</strong>
          <p>Pieces sans preuve complete cote upload</p>
        </article>
        <article className="board-summary-card">
          <span>Prets decision</span>
          <strong>{summary.readyToApprove}</strong>
          <p>Dossiers avec guidance claire pour approbation</p>
        </article>
        <article className="board-summary-card">
          <span>Revue / redemande</span>
          <strong>
            {summary.reviewRecommended}/{summary.resubmitRecommended}
          </strong>
          <p>Guidance prudente avant decision finale</p>
        </article>
      </div>

      <div className="onboarding-filter-bar" aria-label="Filtrer la file onboarding">
        <div>
          <strong>Priorisation ops</strong>
          <span>
            {visibleDrivers.length}/{drivers.length} dossier(s) dans la vue
          </span>
        </div>
        <button
          className="ghost-button onboarding-export-button"
          disabled={!visibleDrivers.length}
          onClick={() => void handleExportCsv()}
          type="button"
        >
          Export CSV
        </button>
        <label className="onboarding-search">
          <span>Recherche dossier</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Nom, telephone, document..."
            type="search"
            value={searchQuery}
          />
        </label>
        <div className="segmented-control">
          {guidanceFilters.map((filter) => {
            const count = filter.level
              ? drivers.filter(
                  (driver) => driver.decisionGuidance.level === filter.level,
                ).length
              : drivers.length;

            return (
              <button
                aria-pressed={guidanceFilter === filter.value}
                className={
                  guidanceFilter === filter.value
                    ? 'segmented-control-button segmented-control-button-active'
                    : 'segmented-control-button'
                }
                key={filter.value}
                onClick={() => setGuidanceFilter(filter.value)}
                type="button"
              >
                {filter.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="onboarding-export-history"
        aria-label="Historique exports onboarding"
      >
        <div className="review-history-heading">
          <div>
            <strong>Trafic exports audite</strong>
            <p>
              Derniers CSV generes par admin ou ops avec filtre, recherche et
              volume.
            </p>
          </div>
          <span>{exportHistory.length} trace(s)</span>
        </div>
        {exportHistory.length ? (
          <div className="onboarding-export-history-list">
            {exportHistory.map((entry) => (
              <article className="onboarding-export-history-row" key={entry.id}>
                <div>
                  <strong>{entry.exportedCount} dossier(s) exporte(s)</strong>
                  <p>
                    {entry.actor.name} - {entry.actor.role} -{' '}
                    {formatReviewDate(entry.createdAt)}
                  </p>
                </div>
                <div className="onboarding-export-history-meta">
                  <span>{formatExportFilterLabel(entry.guidanceFilter)}</span>
                  <span>
                    {entry.searchQuery
                      ? `Recherche: ${entry.searchQuery}`
                      : 'Sans recherche'}
                  </span>
                  <span>
                    {entry.scannedCount} scanne(s)
                    {entry.limit ? ` / limite ${entry.limit}` : ''}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="onboarding-export-empty">
            Aucun export CSV audite sur cette page pour le moment.
          </p>
        )}
      </div>

      <div className="ticket-grid onboarding-grid">
        {visibleDrivers.map((driver) => (
          <article
            className={`ticket-card onboarding-card ${
              busyDriverId === driver.id ? 'ticket-card-busy' : ''
            } ${freshDriverIds.includes(driver.id) ? 'ticket-card-fresh' : ''}`}
            key={driver.id}
          >
            {freshDriverIds.includes(driver.id) ? (
              <span className="entity-transition-badge">Resync live</span>
            ) : null}
            <div className="ticket-topline">
              <span className="priority-badge priority-2">
                {driver.reviewStatus}
              </span>
              <span
                className={`phase-status ${getReviewToneClass(
                  driver.reviewStatus,
                )}`}
              >
                {driver.verificationStatus}
              </span>
            </div>
            <h3>{driver.driverName}</h3>
            <p>
              {driver.email} - {driver.phoneNumber ?? 'Telephone non renseigne'}
            </p>
            <p>
              {driver.activeVehicleCount} vehicule(s) actif(s) - rayon{' '}
              {driver.serviceRadiusKm} km
            </p>
            <p>
              Documents: {driver.documentSummary.approved}/
              {driver.documentSummary.total} approuves,{' '}
              {driver.documentSummary.pending} en attente
            </p>
            <div
              className={`decision-guidance ${getDecisionGuidanceClass(
                driver.decisionGuidance.level,
              )}`}
            >
              <div>
                <span>Guidance dossier</span>
                <strong>{driver.decisionGuidance.label}</strong>
              </div>
              <p>{driver.decisionGuidance.detail}</p>
              {driver.decisionGuidance.blockers.length ? (
                <div className="decision-blockers">
                  {driver.decisionGuidance.blockers.slice(0, 4).map((blocker) => (
                    <span key={blocker}>{blocker}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="integrity-overview">
              <div>
                <span>Score preuves</span>
                <strong>{driver.documentSummary.averageIntegrityScore}%</strong>
              </div>
              <div>
                <span>Points ops</span>
                <strong>{driver.documentSummary.integrityWarnings}</strong>
              </div>
              <div>
                <span>Pieces absentes</span>
                <strong>{driver.documentSummary.missingRequired}</strong>
              </div>
            </div>
            {driver.latestDecisionReason ? (
              <p>Derniere decision: {driver.latestDecisionReason}</p>
            ) : null}
            {driver.reviewHistory.length ? (
              <div className="review-history">
                <div className="review-history-heading">
                  <strong>Historique decisionnel</strong>
                  <span>{driver.reviewHistory.length} trace(s)</span>
                </div>
                {driver.reviewHistory.slice(0, 3).map((review) => (
                  <div className="review-history-row" key={review.id}>
                    <div>
                      <strong>{review.status}</strong>
                      <p>
                        {review.actorName} - {formatReviewDate(review.createdAt)}
                      </p>
                      {review.decisionReason ? <p>{review.decisionReason}</p> : null}
                    </div>
                    <div className="review-history-snapshot">
                      {review.decisionGuidance ? (
                        <span
                          className={`review-guidance-pill ${getDecisionGuidanceClass(
                            review.decisionGuidance.level,
                          )}`}
                        >
                          {review.decisionGuidance.label}
                        </span>
                      ) : (
                        <span className="review-guidance-pill">Snapshot absente</span>
                      )}
                      {review.documentSummary ? (
                        <span>
                          {review.documentSummary.approved}/
                          {review.documentSummary.total} docs,{' '}
                          {review.documentSummary.integrityWarnings} point(s)
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="document-list">
              {driver.documents.map((document) => (
                <div
                  className={`document-row ${
                    freshDocumentIds.includes(document.id) ? 'document-row-fresh' : ''
                  }`}
                  key={document.id}
                >
                  <div>
                    <strong>{document.type}</strong>
                    {freshDocumentIds.includes(document.id) ? (
                      <span className="entity-transition-badge entity-transition-badge-inline">
                        Statut maj
                      </span>
                    ) : null}
                    <p>
                      {document.fileName} - {document.status}
                    </p>
                    <div className="document-integrity">
                      <span
                        className={`phase-status ${getIntegrityToneClass(
                          document.integrity.state,
                        )}`}
                      >
                        Integrite {document.integrity.score}%
                      </span>
                      <span>{formatDocumentSize(document.integrity.sizeBytes)}</span>
                      <span>{document.integrity.uploadSource ?? 'source absente'}</span>
                      <span>{formatShaPreview(document.integrity.sha256)}</span>
                      <span>
                        Objet {document.integrity.objectVerification.state}
                      </span>
                      <span>
                        Scan {document.integrity.safetyScan.state}
                      </span>
                    </div>
                    {document.integrity.safetyScan.state === 'quarantined' ? (
                      <p className="document-quarantine-note">
                        Quarantaine:{' '}
                        {document.integrity.safetyScan.quarantineReason ||
                          document.integrity.safetyScan.findings.join(', ') ||
                          'verification documentaire requise'}
                      </p>
                    ) : null}
                    <div className="document-checks">
                      {document.integrity.checks.map((check) => (
                        <span
                          className={`document-check document-check-${check.state}`}
                          key={check.id}
                        >
                          {check.label}
                        </span>
                      ))}
                    </div>
                    <div
                      className={`document-guidance ${getGuidanceClass(
                        document.integrity.guidance.level,
                      )}`}
                    >
                      <strong>{document.integrity.guidance.label}</strong>
                      <p>{document.integrity.guidance.detail}</p>
                    </div>
                    {document.rejectionReason ? (
                      <p>{document.rejectionReason}</p>
                    ) : null}
                  </div>
                  <div className="document-actions">
                    <button
                      className="ghost-button"
                      disabled={busyDocumentId === document.id}
                      onClick={() => void handleViewDocument(driver.id, document.id)}
                      type="button"
                    >
                      {busyDocumentId === document.id
                        ? 'Generation...'
                        : documentLinks[document.id]
                          ? 'Lien pret'
                          : 'Lien signe'}
                    </button>
                    {documentLinks[document.id] ? (
                      <a
                        className="document-link"
                        href={documentLinks[document.id]}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Ouvrir
                      </a>
                    ) : null}
                    <button
                      className="ghost-button"
                      disabled={busyDocumentId === document.id}
                      onClick={() =>
                        void handleVerifyDocumentObject(driver.id, document.id)
                      }
                      type="button"
                    >
                      {busyDocumentId === document.id
                        ? 'Verification...'
                        : 'Verifier objet'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="ticket-actions">
              {reviewActions.map((action) => (
                <button
                  key={action.status}
                  className={action.className}
                  disabled={
                    busyDriverId === driver.id ||
                    (action.status === 'APPROVED' &&
                      driver.decisionGuidance.level !== 'approve')
                  }
                  onClick={() => void handleReviewAction(driver.id, action.status)}
                  title={
                    action.status === 'APPROVED' &&
                    driver.decisionGuidance.level !== 'approve'
                      ? driver.decisionGuidance.detail
                      : undefined
                  }
                  type="button"
                >
                  {busyDriverId === driver.id
                    ? 'Traitement...'
                    : action.status === driver.decisionGuidance.recommendedStatus
                      ? `${action.label} recommande`
                      : action.label}
                </button>
              ))}
            </div>
          </article>
        ))}

        {!drivers.length ? (
          <article className="ticket-card onboarding-card">
            <div className="ticket-topline">
              <span className="priority-badge priority-1">stable</span>
              <span className="phase-status phase-status-completed">0 dossier</span>
            </div>
            <h3>Aucun dossier en attente</h3>
            <p>La file de revue onboarding est vide pour le moment.</p>
          </article>
        ) : null}

        {drivers.length > 0 && !visibleDrivers.length ? (
          <article className="ticket-card onboarding-card">
            <div className="ticket-topline">
              <span className="priority-badge priority-1">filtre</span>
              <span className="phase-status phase-status-completed">0 dossier</span>
            </div>
            <h3>Aucun dossier dans ce segment</h3>
            <p>
              Modifiez le filtre ou la recherche pour reprendre la revue ops.
            </p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
