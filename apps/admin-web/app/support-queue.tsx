'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type SupportTicketQueueResponse,
  type SupportTicketUpdateResponse,
} from '@orbi/api';
import { describeRealtimeConnection, formatOperationalStatus } from '@orbi/ui';
import {
  adminSyncHighlightDurationMs,
  resolveCollectionDelta,
} from './admin-ops-kernel';
import {
  createAdminMutationHeaders,
  fetchAdminJson,
} from './admin-client-fetch';
import { subscribeToAdminRealtime } from './admin-realtime';

type SupportQueueProps = {
  initialTickets: SupportTicketQueueResponse['tickets'];
  initialStaffing?: SupportTicketQueueResponse['staffing'];
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

function getTicketSlaClass(state: SupportTicketQueueResponse['tickets'][number]['sla']['state']) {
  if (state === 'breached') return 'phase-status-next';
  if (state === 'due_soon') return 'phase-status-planned';
  return 'phase-status-completed';
}

function describeTicketSla(ticket: SupportTicketQueueResponse['tickets'][number]) {
  if (ticket.sla.state === 'closed') return 'SLA ferme';
  if (ticket.sla.state === 'responded') return 'Premiere reponse envoyee';
  if (ticket.sla.state === 'breached') {
    return `Retard ${ticket.sla.breachedMinutes ?? 0} min`;
  }
  return `${ticket.sla.remainingMinutes ?? 0} min restantes`;
}

function deriveFallbackStaffing(
  tickets: SupportTicketQueueResponse['tickets'],
): SupportTicketQueueResponse['staffing'] {
  const activeTickets = tickets.filter(
    (ticket) => ticket.status === 'OPEN' || ticket.status === 'IN_REVIEW',
  );
  const urgentTickets = activeTickets.filter((ticket) => ticket.priority >= 3);
  const breachedSlaTickets = activeTickets.filter(
    (ticket) => ticket.sla.state === 'breached',
  );
  const dueSoonTickets = activeTickets.filter(
    (ticket) => ticket.sla.state === 'due_soon',
  );
  const posture =
    breachedSlaTickets.length > 0 || urgentTickets.length >= 3
      ? 'blocked'
      : dueSoonTickets.length > 0 || activeTickets.length > 5
        ? 'strained'
        : 'ready';

  return {
    posture,
    action:
      posture === 'blocked'
        ? 'Bloquer extension pilote: assigner une permanence ops/support.'
        : posture === 'strained'
          ? 'Garder le pilote limite: ajouter renfort support avant pic demande.'
          : 'Permanence support compatible avec un pilote encadre.',
    activeTickets: activeTickets.length,
    urgentTickets: urgentTickets.length,
    breachedSlaTickets: breachedSlaTickets.length,
    dueSoonTickets: dueSoonTickets.length,
    ownerLoad: (['ops', 'support'] as const).map((owner) => {
      const ownerTickets = activeTickets.filter((ticket) => ticket.sla.owner === owner);
      return {
        owner,
        activeTickets: ownerTickets.length,
        urgentTickets: ownerTickets.filter((ticket) => ticket.priority >= 3).length,
        breachedSlaTickets: ownerTickets.filter(
          (ticket) => ticket.sla.state === 'breached',
        ).length,
      };
    }),
  };
}

async function fetchSupportTickets() {
  return fetchAdminJson<SupportTicketQueueResponse>('/api/admin/support-tickets');
}

async function updateSupportTicket(
  ticketId: string,
  payload: {
    status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
    priority?: number;
    adminNote?: string;
  },
) {
  return fetchAdminJson<SupportTicketUpdateResponse>(
    `/api/admin/support-tickets/${ticketId}`,
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

export function SupportQueue({ initialTickets, initialStaffing }: SupportQueueProps) {
  const [tickets, setTickets] = useState(initialTickets);
  const [staffing, setStaffing] = useState(
    initialStaffing ?? deriveFallbackStaffing(initialTickets),
  );
  const [status, setStatus] = useState('File support synchronisee.');
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [freshTicketIds, setFreshTicketIds] = useState<string[]>([]);
  const previousTicketsRef = useRef<SupportQueueProps['initialTickets'] | null>(null);
  const ticketUpdateInFlightRef = useRef(new Set<string>());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const refreshTickets = useCallback(
    async (showMessage = true, successMessage = 'File support actualisee.') => {
      try {
        const response = await fetchSupportTickets();
        setTickets(response.tickets);
        setStaffing(response.staffing ?? deriveFallbackStaffing(response.tickets));

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
    const breached = tickets.filter((ticket) => ticket.sla.state === 'breached').length;
    const dueSoon = tickets.filter((ticket) => ticket.sla.state === 'due_soon').length;

    return { open, inReview, resolved, urgent, breached, dueSoon };
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
      adminNote?: string;
    },
    message: string,
  ) {
    if (ticketUpdateInFlightRef.current.has(ticketId)) {
      return false;
    }

    ticketUpdateInFlightRef.current.add(ticketId);
    setBusyTicketId(ticketId);
    setStatus(message);

    try {
      await updateSupportTicket(ticketId, payload);
      await refreshTickets(false);
      setStatus('Ticket mis a jour avec succes.');
      return true;
    } catch {
      setStatus('La mise a jour du ticket a echoue.');
      return false;
    } finally {
      ticketUpdateInFlightRef.current.delete(ticketId);
      setBusyTicketId(null);
    }
  }

  async function handleSendNote(ticketId: string) {
    const note = noteDrafts[ticketId]?.trim();
    if (!note) return;
    const sent = await handleTicketUpdate(
      ticketId,
      { adminNote: note },
      'Envoi de la reponse au ticket...',
    );

    if (sent) {
      setNoteDrafts((prev) => ({ ...prev, [ticketId]: '' }));
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
          <span>Permanence</span>
          <strong>{staffing.posture}</strong>
          <p>{staffing.action}</p>
        </article>
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
          <span>SLA</span>
          <strong>{staffing.breachedSlaTickets}</strong>
          <p>{summary.dueSoon} ticket(s) proche(s) de l echeance</p>
        </article>
        <article className="board-summary-card">
          <span>Resolus</span>
          <strong>{summary.resolved}</strong>
          <p>Tickets deja fermes ou resolus</p>
        </article>
      </div>

      <div className="job-owner-grid" aria-label="Charge support par owner">
        {staffing.ownerLoad.map((owner) => (
          <article className="job-owner-card" key={owner.owner}>
            <span>{owner.owner}</span>
            <strong>{owner.activeTickets}</strong>
            <p>
              {owner.urgentTickets} urgent(s), {owner.breachedSlaTickets} SLA
              en retard
            </p>
          </article>
        ))}
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
              <span className={`phase-status ${getTicketSlaClass(ticket.sla.state)}`}>
                {describeTicketSla(ticket)}
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
            <div className="ticket-sla-panel">
              <span>Owner {ticket.sla.owner}</span>
              <strong>
                P{ticket.priority} - {ticket.sla.targetMinutes} min
              </strong>
              <p>
                Echeance {new Date(ticket.sla.dueAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            {ticket.adminNote ? (
              <div className="ticket-admin-note">
                <span className="ticket-admin-note-label">Reponse ops</span>
                <p>{ticket.adminNote}</p>
              </div>
            ) : null}

            <div className="ticket-reply-row">
              <textarea
                className="ticket-reply-input"
                disabled={busyTicketId === ticket.id}
                maxLength={1000}
                onChange={(e) =>
                  setNoteDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                }
                placeholder="Repondre au ticket..."
                rows={2}
                value={noteDrafts[ticket.id] ?? ''}
              />
              <button
                className="ticket-button ticket-button-neutral"
                disabled={busyTicketId === ticket.id || !noteDrafts[ticket.id]?.trim()}
                onClick={() => void handleSendNote(ticket.id)}
                type="button"
              >
                Envoyer
              </button>
            </div>

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
