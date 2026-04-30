'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  authenticateAndFetchCurrentUser,
  createMobilisApiClient,
  fetchAdminDriverDocumentViewLink,
  fetchAdminDriverOnboardingQueue,
  updateAdminDriverOnboardingReview,
  type DriverOnboardingQueueResponse,
} from '@mobilis/api';
import { describeRealtimeConnection } from '@mobilis/ui';
import {
  adminSyncHighlightDurationMs,
  resolveDriverOnboardingDelta,
} from './admin-ops-kernel';
import { mobilisDemoAccounts, mobilisRuntimeConfig } from '@mobilis/config';
import { subscribeToAdminRealtime } from './admin-realtime';

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

function getReviewToneClass(status: string) {
  if (status === 'APPROVED') {
    return 'phase-status-completed';
  }

  if (status === 'CHANGES_REQUESTED') {
    return 'phase-status-next';
  }

  return 'phase-status-planned';
}

export function DriverOnboardingReviewBoard({
  initialQueue,
}: DriverOnboardingReviewBoardProps) {
  const [drivers, setDrivers] = useState(initialQueue);
  const [status, setStatus] = useState('File onboarding synchronisee.');
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [documentLinks, setDocumentLinks] = useState<Record<string, string>>({});
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [freshDriverIds, setFreshDriverIds] = useState<string[]>([]);
  const [freshDocumentIds, setFreshDocumentIds] = useState<string[]>([]);
  const previousDriversRef =
    useRef<DriverOnboardingReviewBoardProps['initialQueue'] | null>(null);

  const client = useMemo(
    () =>
      createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
        version: mobilisRuntimeConfig.apiVersion,
      }),
    [],
  );

  const withAdminClient = useCallback(async () => {
    const { authClient } = await authenticateAndFetchCurrentUser(
      client,
      mobilisDemoAccounts.admin,
    );

    return authClient;
  }, [client]);

  const refreshQueue = useCallback(
    async (message = 'File onboarding actualisee.') => {
      try {
        const authClient = await withAdminClient();
        const response = await fetchAdminDriverOnboardingQueue(authClient);
        setDrivers(response.drivers);
        setStatus(message);
      } catch {
        setStatus("Impossible d'actualiser la file onboarding.");
      }
    },
    [withAdminClient],
  );

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

    return { approved, underReview, changesRequested, pendingDocuments };
  }, [drivers]);

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
      const authClient = await withAdminClient();
      const driver = drivers.find((candidate) => candidate.id === driverId);
      await updateAdminDriverOnboardingReview(authClient, driverId, {
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
      const authClient = await withAdminClient();
      const response = await fetchAdminDriverDocumentViewLink(
        authClient,
        driverId,
        documentId,
      );
      setDocumentLinks((current) => ({
        ...current,
        [documentId]: response.signedUrl,
      }));
      setStatus('Lien signe genere.');
    } catch {
      setStatus("Impossible de generer le lien signe du justificatif.");
    } finally {
      setBusyDocumentId(null);
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
      </div>

      <div className="ticket-grid onboarding-grid">
        {drivers.map((driver) => (
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
            {driver.latestDecisionReason ? (
              <p>Derniere decision: {driver.latestDecisionReason}</p>
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
                  </div>
                </div>
              ))}
            </div>

            <div className="ticket-actions">
              {reviewActions.map((action) => (
                <button
                  key={action.status}
                  className={action.className}
                  disabled={busyDriverId === driver.id}
                  onClick={() => void handleReviewAction(driver.id, action.status)}
                  type="button"
                >
                  {busyDriverId === driver.id ? 'Traitement...' : action.label}
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
      </div>
    </section>
  );
}
