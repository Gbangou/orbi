import type { SupportTicket } from '@orbi/api';

const mobileTechnicalTicketPattern = /^Erreur mobile\s+MOB-/i;

export function isRiderVisibleSupportTicket(ticket: SupportTicket) {
  return !mobileTechnicalTicketPattern.test(ticket.subject.trim());
}

export function filterRiderVisibleSupportTickets(tickets: SupportTicket[]) {
  return tickets.filter(isRiderVisibleSupportTicket);
}
