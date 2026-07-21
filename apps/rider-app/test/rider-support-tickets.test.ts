import type { SupportTicket } from '@orbi/api';

import { filterRiderVisibleSupportTickets } from '../lib/rider-support-tickets';

function ticket(subject: string): SupportTicket {
  return {
    id: subject.toLowerCase().replace(/\s+/g, '-'),
    subject,
    description: 'Description.',
    status: 'OPEN',
    priority: 1,
    adminNote: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
  };
}

describe('rider-support-tickets', () => {
  it('keeps user-created tickets and hides automatic mobile technical tickets', () => {
    const visible = filterRiderVisibleSupportTickets([
      ticket('Paiement a verifier'),
      ticket('Erreur mobile MOB-GENERIC-API 7zwsje'),
      ticket('Prix de course conteste'),
    ]);

    expect(visible.map((t) => t.subject)).toEqual([
      'Paiement a verifier',
      'Prix de course conteste',
    ]);
  });
});
