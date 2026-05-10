'use client';

import { useState } from 'react';
import {
  type AdminPaymentAttemptProviderVerificationResponse,
  type AdminPaymentAttemptRefundResponse,
  type AdminPaymentWebhookEventsResponse,
  type AdminPaymentWebhookInvestigationResponse,
  type AdminPaymentWebhookReplayResponse,
} from '@mobilis/api';
import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
} from './admin-server-security';

type PaymentWebhookJournalBoardProps = {
  journal: AdminPaymentWebhookEventsResponse;
};

type PaymentWebhookJournalEvent =
  AdminPaymentWebhookEventsResponse['events'][number];
type PaymentWebhookJournalKind = 'all' | 'payment' | 'refund' | 'ignored';

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
    ignored_amount_mismatch: 'Montant suspect',
    ignored_conflicting_provider_reference: 'Conflit reference',
    ignored_unknown_reference: 'Reference inconnue',
    ignored_missing_reference: 'Reference absente',
    refund_processed: 'Refund confirme',
    refund_still_pending: 'Refund en attente',
  };

  return labels[action] ?? action;
}

function actionClass(action: string) {
  if (action === 'persisted_and_reconciled' || action === 'refund_processed') {
    return 'phase-status-completed';
  }

  if (
    action === 'persisted_idempotent_replay' ||
    action === 'refund_still_pending'
  ) {
    return 'phase-status-next';
  }

  return 'phase-status-planned';
}

function formatPaymentAttemptStatus(
  status: NonNullable<PaymentWebhookJournalEvent['paymentAttempt']>['status'],
) {
  const labels: Record<
    NonNullable<PaymentWebhookJournalEvent['paymentAttempt']>['status'],
    string
  > = {
    INITIATED: 'Initie',
    PENDING: 'En attente',
    SUCCEEDED: 'Encaisse',
    FAILED: 'Echoue',
    CANCELLED: 'Annule',
    REFUND_PENDING: 'Remboursement en attente',
    REFUNDED: 'Rembourse',
  };

  return labels[status];
}

function canRefundPaymentAttempt(event: PaymentWebhookJournalEvent) {
  return event.paymentAttempt?.status === 'SUCCEEDED';
}

async function fetchAdminJson<TResponse>(path: string) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error('Admin request failed');
  }

  return (await response.json()) as TResponse;
}

async function postAdminMutation<TResponse>(path: string) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      [adminMutationHeaderName]: adminMutationHeaderValue,
    },
  });

  if (!response.ok) {
    throw new Error('Admin mutation failed');
  }

  return (await response.json()) as TResponse;
}

export function PaymentWebhookJournalBoard({
  journal,
}: PaymentWebhookJournalBoardProps) {
  const [journalState, setJournalState] = useState(journal.events);
  const [journalSummary, setJournalSummary] = useState(journal.summary);
  const [activeKind, setActiveKind] =
    useState<PaymentWebhookJournalKind>('all');
  const [statusByEventId, setStatusByEventId] = useState<
    Record<string, string>
  >({});
  const [busyByEventId, setBusyByEventId] = useState<Record<string, boolean>>(
    {},
  );

  async function filterJournal(kind: PaymentWebhookJournalKind) {
    setActiveKind(kind);

    try {
      const response = await fetchAdminJson<AdminPaymentWebhookEventsResponse>(
        `/api/admin/payment-webhook-events${
          kind === 'all' ? '' : `?kind=${kind}`
        }`,
      );

      setJournalState(response.events);
      setJournalSummary(response.summary);
      setStatusByEventId({});
    } catch {
      setStatusByEventId((current) => ({
        ...current,
        journal: "Le filtre du journal n'a pas pu etre applique.",
      }));
    }
  }

  async function startInvestigation(eventId: string) {
    setBusyByEventId((current) => ({
      ...current,
      [eventId]: true,
    }));
    setStatusByEventId((current) => ({
      ...current,
      [eventId]: 'Investigation en cours...',
    }));

    try {
      const response =
        await postAdminMutation<AdminPaymentWebhookInvestigationResponse>(
          `/api/admin/payment-webhook-events/${eventId}/investigation`,
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
    } finally {
      setBusyByEventId((current) => ({
        ...current,
        [eventId]: false,
      }));
    }
  }

  async function replayEvent(eventId: string) {
    setBusyByEventId((current) => ({
      ...current,
      [eventId]: true,
    }));
    setStatusByEventId((current) => ({
      ...current,
      [eventId]: 'Replay en cours...',
    }));

    try {
      const response =
        await postAdminMutation<AdminPaymentWebhookReplayResponse>(
          `/api/admin/payment-webhook-events/${eventId}/replay`,
      );

      updateEventFromReconciliation(eventId, {
        nextAction: response.replay.result.nextAction,
        reconciledAttemptCount: response.replay.result.reconciledAttemptCount,
        providerReference: response.replay.result.providerReference,
        transactionRef: response.replay.result.transactionRef,
      });
      setStatusByEventId((current) => ({
        ...current,
        [eventId]: `${formatAction(
          response.replay.result.nextAction,
        )} - ${response.replay.result.reconciledAttemptCount} tentative(s).`,
      }));
    } catch {
      setStatusByEventId((current) => ({
        ...current,
        [eventId]: "Le replay n'a pas pu etre execute.",
      }));
    } finally {
      setBusyByEventId((current) => ({
        ...current,
        [eventId]: false,
      }));
    }
  }

  async function verifyAttempt(eventId: string, paymentAttemptId: string) {
    setBusyByEventId((current) => ({
      ...current,
      [eventId]: true,
    }));
    setStatusByEventId((current) => ({
      ...current,
      [eventId]: 'Verification fournisseur...',
    }));

    try {
      const response =
        await postAdminMutation<AdminPaymentAttemptProviderVerificationResponse>(
          `/api/admin/payment-attempts/${paymentAttemptId}/verify-provider`,
      );

      updateEventFromReconciliation(eventId, {
        nextAction: response.verification.result.nextAction,
        reconciledAttemptCount:
          response.verification.result.reconciledAttemptCount,
        providerReference: response.verification.result.providerReference,
        transactionRef: response.verification.result.transactionRef,
      });
      setStatusByEventId((current) => ({
        ...current,
        [eventId]: `${formatAction(
          response.verification.result.nextAction,
        )} - ${response.verification.provider}.`,
      }));
    } catch {
      setStatusByEventId((current) => ({
        ...current,
        [eventId]: "La verification fournisseur n'a pas pu aboutir.",
      }));
    } finally {
      setBusyByEventId((current) => ({
        ...current,
        [eventId]: false,
      }));
    }
  }

  async function refundAttempt(eventId: string, paymentAttemptId: string) {
    setBusyByEventId((current) => ({
      ...current,
      [eventId]: true,
    }));
    setStatusByEventId((current) => ({
      ...current,
      [eventId]: 'Remboursement en cours...',
    }));

    try {
      const response = await postAdminMutation<AdminPaymentAttemptRefundResponse>(
        `/api/admin/payment-attempts/${paymentAttemptId}/refund`,
      );

      setJournalState((current) =>
        current.map((event): PaymentWebhookJournalEvent =>
          event.id === eventId
            ? {
                ...event,
                paymentAttempt: event.paymentAttempt
                  ? {
                      ...event.paymentAttempt,
                      status: response.refund.paymentAttempt.status,
                      updatedAt: response.refund.paymentAttempt.updatedAt,
                    }
                  : event.paymentAttempt,
              }
            : event,
        ),
      );
      setStatusByEventId((current) => ({
        ...current,
        [eventId]:
          response.refund.action === 'already_refunded'
            ? 'Paiement deja rembourse.'
            : response.refund.action === 'refund_pending'
              ? `Remboursement demande: ${response.refund.providerRefundReference}.`
            : `Remboursement prepare: ${response.refund.providerRefundReference}.`,
      }));
    } catch {
      setStatusByEventId((current) => ({
        ...current,
        [eventId]: "Le remboursement n'a pas pu etre execute.",
      }));
    } finally {
      setBusyByEventId((current) => ({
        ...current,
        [eventId]: false,
      }));
    }
  }

  function updateEventFromReconciliation(
    eventId: string,
    result: {
      nextAction: string;
      reconciledAttemptCount: number;
      providerReference?: string;
      transactionRef: string | null;
    },
  ) {
    setJournalState((current) =>
      current.map((event): PaymentWebhookJournalEvent =>
        event.id === eventId
          ? {
              ...event,
              action: result.nextAction,
              reconciledAttemptCount: result.reconciledAttemptCount,
              providerReference:
                result.providerReference ?? event.providerReference,
              transactionRef: result.transactionRef ?? event.transactionRef,
              paymentAttempt:
                event.paymentAttempt &&
                (result.nextAction === 'refund_processed' ||
                  result.nextAction === 'refund_still_pending')
                  ? {
                      ...event.paymentAttempt,
                      status:
                        result.nextAction === 'refund_processed'
                          ? 'REFUNDED'
                          : 'REFUND_PENDING',
                      updatedAt: new Date().toISOString(),
                    }
                  : event.paymentAttempt,
            }
          : event,
      ),
    );
  }

  return (
    <section className="panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Audit paiement</p>
          <h2>Journal webhooks fournisseur</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Les dernieres notifications paiement conservees pour investigation
            ops, verification signature et suivi des references externes.
          </p>
          <div className="ticket-actions">
            {(
              [
                ['all', 'Tous'],
                ['payment', 'Paiements'],
                ['refund', 'Refunds'],
                ['ignored', 'Ignores'],
              ] as const
            ).map(([kind, label]) => (
              <button
                className={`ticket-button ${
                  activeKind === kind ? '' : 'ticket-button-neutral'
                }`}
                key={kind}
                onClick={() => void filterJournal(kind)}
                type="button"
              >
                {label}
              </button>
            ))}
            <span className="queue-status">
              Paiement {journalSummary.paymentEvents}
            </span>
            <span className="queue-status">
              Refund {journalSummary.refundEvents}
            </span>
            <span className="queue-status">
              Ignores {journalSummary.ignoredEvents}
            </span>
          </div>
          {statusByEventId.journal ? (
            <span className="queue-status">{statusByEventId.journal}</span>
          ) : null}
        </div>
      </div>

      <div className="roadmap-grid live-ops-grid">
        {journalState.map((event) => (
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
              <div className="trip-meta-card">
                <span>Paiement</span>
                <strong>
                  {event.paymentAttempt
                    ? formatPaymentAttemptStatus(event.paymentAttempt.status)
                    : 'Non lie'}
                </strong>
              </div>
            </div>
            {event.paymentAttempt ? (
              <p>
                Tentative: {event.paymentAttempt.currency}{' '}
                {Math.round(event.paymentAttempt.amount).toLocaleString(
                  'fr-FR',
                )}{' '}
                - MAJ{' '}
                {new Date(event.paymentAttempt.updatedAt).toLocaleString(
                  'fr-FR',
                  {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  },
                )}
              </p>
            ) : null}
            <p>{formatPayloadPreview(event.payloadPreview)}</p>
            <div className="ticket-actions">
              <button
                className="ticket-button ticket-button-neutral"
                disabled={busyByEventId[event.id]}
                onClick={() => void startInvestigation(event.id)}
                type="button"
              >
                Investiguer
              </button>
              <button
                className="ticket-button"
                disabled={busyByEventId[event.id]}
                onClick={() => void replayEvent(event.id)}
                type="button"
              >
                Rejouer
              </button>
              {event.paymentAttemptId ? (
                <button
                  className="ticket-button ticket-button-neutral"
                  disabled={busyByEventId[event.id]}
                  onClick={() =>
                    void verifyAttempt(event.id, event.paymentAttemptId!)
                  }
                  type="button"
                >
                  Verifier provider
                </button>
              ) : null}
              {event.paymentAttemptId ? (
                <button
                  className="ticket-button ticket-button-neutral"
                  disabled={
                    busyByEventId[event.id] || !canRefundPaymentAttempt(event)
                  }
                  onClick={() =>
                    void refundAttempt(event.id, event.paymentAttemptId!)
                  }
                  type="button"
                >
                  {event.paymentAttempt?.status === 'REFUNDED'
                    ? 'Rembourse'
                    : event.paymentAttempt?.status === 'REFUND_PENDING'
                      ? 'En attente'
                    : 'Rembourser'}
                </button>
              ) : null}
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
        {!journalState.length ? (
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
