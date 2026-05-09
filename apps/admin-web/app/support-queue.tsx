'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type SupportTicketQueueResponse,
  type SupportTicketUpdateResponse,
} from '@mobilis/api';
import { describeRealtimeConnection, formatOperationalStatus } from '@mobilis/ui';
import {
  adminSyncHighlightDurationMs,
  resolveCollectionDelta,
} from './admin-ops-kernel';
import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
} from './admin-server-security';
import { subscribeToAdminRealtime } from './admin-realtime';

type SupportQueueProps = {
  initialTickets: SupportTicketQueueResponse['tickets'];
};

function getTicketStatusClass(status: string) {
  if (status === 'OPEN') {
    return 'phase-status-next';
  }

  if (status === 'IN_REVIEW') {
    return 'phase-status-planned';
  }

  return 'phase-status-completed';
}

async function fetchSupportTickets() {
  const response = await fetch('/api/admin/support-tickets');

  if (!response.ok) {
    throw new Error('Support queue fetch failed');
  }

  return (await response.json()) as SupportTicketQueueResponse;
}

async function updateSupportTicket(
  ticketId: string,
  payload: {
    status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
    priority?: number;
  },
) {
  const response = await fetch(`/api/admin/support-tickets/${ticketId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      [adminMutationHeaderName]: adminMutationHeaderValue,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Support ticket update failed');
  }

  return (await response.json()) as SupportTicketUpdateResponse;
}

export function SupportQueue({ initialTickets }: SupportQueueProps) {
  const [tickets, setTickets] = useState(initialTickets);
  const [status, setStatus] = useState('File support synchronisee.');
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [freshTicketIds, setFreshTicketIds] = useState<string[]>([]);
  const previousTicketsRef = useRef<SupportQueueProps['initialTickets'] | null>(null);

  const refreshTickets = useCallback(
    async (showMessage = true, successMessage = 'File support actualisee.') => {
      try {
        const response = await fetchSupportTickets();
        setTickets(response.tickets);

        if (showMessage) {
          setStatus(successMessage);
        }
      } catch {
        if (showMessage) {
          setStatus("Impossible d'actualiser la file support.");
        }
      }
    },
    [],
  );

  const summary = useMemo(() => {
    const open = tickets.filter((ticket) => ticket.status === 'OPEN').length;
    const inReview = tickets.filter(
      (ticket) => ticket.status === 'IN_REVIEW',
    ).length;
    const resolved = tickets.filter(
      (ticket) => ticket.status === 'RESOLVED' || ticket.status === 'CLOSED',
    ).length;
    const urgent = tickets.filter((ticket) => ticket.priority === 3).length;

    return { open, inReview, resolved, urgent };
  }, [tickets]);

  useEffect(() => {
    const stream = subscribeToAdminRealtime({
      'trip.incident-reported': () =>
        void refreshTickets(true, 'Nouvel incident remonte dans la file support.'),
      'mobile.error-reports-submitted': () =>
        void refreshTickets(true, 'Signal mobile critique remonte dans la file support.'),
      'support-ticket.updated': () =>
        void refreshTickets(true, 'File support synchronisee apres mise a jour.'),
      heartbeat: () =>
        setStatus(describeRealtimeConnection('admin-support', 'active')),
    });

    stream.onopen = () => {
      setStatus(describeRealtimeConnection('admin-support', 'connected'));
    };

    stream.onerror = () => {
      setStatus(describeRealtimeConnection('admin-support', 'reconnecting'));
    };

    return () => stream.close();
  }, [refreshTickets]);

  useEffect(() => {
    const previousTickets = previousTicketsRef.current;

    if (previousTickets) {
      const delta = resolveCollectionDelta(previousTickets, tickets, {
        getId: (ticket) => ticket.id,
        hasChanged: (previousTicket, nextTicket) =>
          previousTicket.status !== nextTicket.status
          || previousTicket.priority !== nextTicket.priority,
      });
      const updatedTicket = tickets.find((ticket) =>
        delta.updatedIds.includes(ticket.id),
      );

      if (delta.freshIds.length > 0) {
        setFreshTicketIds(delta.freshIds);
        setTransitionLabel(
          delta.freshIds.length > 1
            ? `${delta.freshIds.length} nouveaux tickets viennent d entrer dans la file support.`
            : 'Un nouveau ticket vient d entrer dans la file support.',
        );
      } else if (updatedTicket) {
        setFreshTicketIds([updatedTicket.id]);
        setTransitionLabel(
          `Ticket resynchronise: ${formatOperationalStatus(updatedTicket.status)}.`,
        );
      } else if (delta.removedIds.length > 0) {
        setTransitionLabel(
          delta.removedIds.length > 1
            ? `${delta.removedIds.length} tickets ont quitte la file active.`
            : 'Un ticket a quitte la file active.',
        );
      }
    }

    previousTicketsRef.current = tickets;
  }, [tickets]);

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
    if (!freshTicketIds.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFreshTicketIds([]);
    }, adminSyncHighlightDurationMs);

    return () => window.clearTimeout(timeout);
  }, [freshTicketIds]);

  async function handleTicketUpdate(
    ticketId: string,
    payload: {
      status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
      priority?: number;
    },
    message: string,
  ) {
    setBusyTicketId(ticketId);
    setStatus(message);

    try {
      await updateSupportTicket(ticketId, payload);
      await refreshTickets(false);
      setStatus('Ticket mis a jour avec succes.');
    } catch {
      setStatus('La mise a jour du ticket a echoue.');
    } finally {
      setBusyTicketId(null);
    }
  }

  return (
    <section className="panel ops-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Support Queue</p>
          <h2>Incidents a traiter</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Les alertes terrain remontent maintenant dans une file exploitable
            par l equipe operations et support.
          </p>
          <div className="queue-actions">
            <button
              className="ghost-button"
              onClick={() => void refreshTickets(true)}
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
          <span>Ouverts</span>
          <strong>{summary.open}</strong>
          <p>Tickets encore sans prise en charge</p>
        </article>
        <article className="board-summary-card">
          <span>En revue</span>
          <strong>{summary.inReview}</strong>
          <p>Tickets actuellement traites par les ops</p>
        </article>
        <article className="board-summary-card">
          <span>Urgents</span>
          <strong>{summary.urgent}</strong>
          <p>Priorite P3 a surveiller en premier</p>
        </article>
        <article className="board-summary-card">
          <span>Resolus</span>
          <strong>{summary.resolved}</strong>
          <p>Tickets deja fermes ou resolus</p>
        </article>
      </div>

      <div className="ticket-grid">
        {tickets.map((ticket) => (
          <article
            className={`ticket-card ${
              busyTicketId === ticket.id ? 'ticket-card-busy' : ''
            } ${freshTicketIds.includes(ticket.id) ? 'ticket-card-fresh' : ''}`}
            key={ticket.id}
          >
            {freshTicketIds.includes(ticket.id) ? (
              <span className="entity-transition-badge">Resync live</span>
            ) : null}
            <div className="ticket-topline">
              <span className={`priority-badge priority-${ticket.priority}`}>
                P{ticket.priority}
              </span>
              <span className={`phase-status ${getTicketStatusClass(ticket.status)}`}>
                {formatOperationalStatus(ticket.status)}
              </span>
            </div>
            <h3>{ticket.subject}</h3>
            <p>
              {ticket.requesterName} - {ticket.requesterRole}
            </p>
            <p>
              {ticket.tripId
                ? `Trajet lie: ${ticket.tripId}`
                : 'Trajet non identifie'}
            </p>
            <p>{ticket.description}</p>
            <div className="ticket-actions">
              <button
                className="ticket-button ticket-button-neutral"
                disabled={
                  busyTicketId === ticket.id ||
                  ticket.status === 'IN_REVIEW' ||
                  ticket.status === 'RESOLVED' ||
                  ticket.status === 'CLOSED'
                }
                onClick={() =>
                  void handleTicketUpdate(
                    ticket.id,
                    { status: 'IN_REVIEW' },
                    'Prise en charge du ticket...',
                  )
                }
                type="button"
              >
                {busyTicketId === ticket.id ? 'Traitement...' : 'Prendre en charge'}
              </button>
              <button
                className="ticket-button ticket-button-success"
                disabled={
                  busyTicketId === ticket.id ||
                  ticket.status === 'RESOLVED' ||
                  ticket.status === 'CLOSED'
                }
                onClick={() =>
                  void handleTicketUpdate(
                    ticket.id,
                    { status: 'RESOLVED' },
                    'Resolution du ticket...',
                  )
                }
                type="button"
              >
                {busyTicketId === ticket.id ? 'Traitement...' : 'Marquer resolu'}
              </button>
            </div>
          </article>
        ))}
        {!tickets.length ? (
          <article className="ticket-card">
            <div className="ticket-topline">
              <span className="priority-badge priority-1">P1</span>
              <span className="phase-status phase-status-completed">
                stable
              </span>
            </div>
            <h3>Aucun ticket en attente</h3>
            <p>La file support est vide pour le moment.</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
