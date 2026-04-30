'use client';

import { useMemo, useState } from 'react';
import {
  authenticateAndFetchCurrentUser,
  createMobilisApiClient,
  startAdminPaymentWebhookInvestigation,
  type AdminPaymentWebhookEventsResponse,
} from '@mobilis/api';
import { mobilisDemoAccounts, mobilisRuntimeConfig } from '@mobilis/config';

type PaymentWebhookJournalBoardProps = {
  journal: AdminPaymentWebhookEventsResponse;
};

function formatPayloadPreview(preview: Record<string, unknown>) {
  const entries = Object.entries(preview);

  if (!entries.length) {
    return 'Payload conserve pour detail securise.';
  }

  return entries
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' - ');
}

function formatAction(action: string) {
  const labels: Record<string, string> = {
    persisted_and_reconciled: 'Reconcilie',
    persisted_idempotent_replay: 'Replay idempotent',
    ignored_conflicting_provider_reference: 'Conflit reference',
    ignored_unknown_reference: 'Reference inconnue',
    ignored_missing_reference: 'Reference absente',
  };

  return labels[action] ?? action;
}

function actionClass(action: string) {
  if (action === 'persisted_and_reconciled') {
    return 'phase-status-completed';
  }

  if (action === 'persisted_idempotent_replay') {
    return 'phase-status-next';
  }

  return 'phase-status-planned';
}

export function PaymentWebhookJournalBoard({
  journal,
}: PaymentWebhookJournalBoardProps) {
  const [statusByEventId, setStatusByEventId] = useState<
    Record<string, string>
  >({});
  const client = useMemo(
    () =>
      createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
        version: mobilisRuntimeConfig.apiVersion,
      }),
    [],
  );

  async function startInvestigation(eventId: string) {
    setStatusByEventId((current) => ({
      ...current,
      [eventId]: 'Investigation en cours...',
    }));

    try {
      const { authClient } = await authenticateAndFetchCurrentUser(
        client,
        mobilisDemoAccounts.admin,
      );
      const response = await startAdminPaymentWebhookInvestigation(
        authClient,
        eventId,
      );

      setStatusByEventId((current) => ({
        ...current,
        [eventId]: response.investigation.supportTicket
          ? `Ticket ${response.investigation.supportTicket.id} ouvert.`
          : 'Investigation auditee sans ticket lie.',
      }));
    } catch {
      setStatusByEventId((current) => ({
        ...current,
        [eventId]: "L investigation n'a pas pu etre lancee.",
      }));
    }
  }

  return (
    <section className="panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Audit paiement</p>
          <h2>Journal webhooks fournisseur</h2>
        </div>
        <p className="lede">
          Les dernieres notifications paiement conservees pour investigation
          ops, verification signature et suivi des references externes.
        </p>
      </div>

      <div className="roadmap-grid live-ops-grid">
        {journal.events.map((event) => (
          <article className="phase-card live-trip-card" key={event.id}>
            <div className="ticket-topline">
              <span className={`phase-status ${actionClass(event.action)}`}>
                {formatAction(event.action)}
              </span>
              <span className="live-trip-fare">{event.provider}</span>
            </div>
            <h3>{event.eventType}</h3>
            <p>
              Reference Mobilis: {event.transactionRef ?? 'absente'} -
              fournisseur: {event.providerReference ?? 'absente'}
            </p>
            <div className="trip-meta-grid">
              <div className="trip-meta-card">
                <span>Signature</span>
                <strong>
                  {event.signatureVerified ? 'Verifiee' : 'Non fournie'}
                </strong>
              </div>
              <div className="trip-meta-card">
                <span>Reconciliation</span>
                <strong>{event.reconciledAttemptCount}</strong>
              </div>
            </div>
            <p>{formatPayloadPreview(event.payloadPreview)}</p>
            <div className="ticket-actions">
              <button
                className="ticket-button ticket-button-neutral"
                onClick={() => void startInvestigation(event.id)}
                type="button"
              >
                Investiguer
              </button>
              {statusByEventId[event.id] ? (
                <span className="queue-status">{statusByEventId[event.id]}</span>
              ) : null}
            </div>
            <p>
              {new Date(event.createdAt).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </p>
          </article>
        ))}
        {!journal.events.length ? (
          <article className="phase-card">
            <span className="phase-status phase-status-planned">stable</span>
            <h3>Aucun webhook journalise</h3>
            <p>Le journal paiement attend les premieres notifications.</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
