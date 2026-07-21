/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('support queue board', () => {
  it('guards support ticket updates and preserves failed note drafts', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/support-queue.tsx'),
      'utf8',
    );

    expect(source).toContain('ticketUpdateInFlightRef');
    expect(source).toContain('ticketUpdateInFlightRef.current.has(ticketId)');
    expect(source).toContain('ticketUpdateInFlightRef.current.add(ticketId)');
    expect(source).toContain('ticketUpdateInFlightRef.current.delete(ticketId)');
    expect(source).toContain('return true;');
    expect(source).toContain('return false;');
    expect(source).toContain('if (sent)');
    expect(source).toContain('describeTicketCategory');
    expect(source).toContain("quality_review: 'Qualite'");
    expect(source).toContain("ticket.category === 'payment'");
    expect(source).toContain("ticket.category === 'rider_cancellation'");
    expect(source).toContain('{ticket.actionHint}');
    expect(source).toContain('approveCancellationCompensation');
    expect(source).toContain('/cancellation-compensation');
    expect(source).toContain('handleApproveCancellationCompensation');
    expect(source).toContain('Indemniser chauffeur');
    expect(source).toContain('verifyTicketPaymentAttempt');
    expect(source).toContain('refundTicketPaymentAttempt');
    expect(source).toContain('handleVerifyTicketPayment');
    expect(source).toContain('handleRefundTicketPayment');
    expect(source).toContain('Verifier provider');
    expect(source).toContain('Rembourser');
    expect(source).toContain('support-refund-${ticketId}-${paymentAttemptId}');
    expect(source).toContain("'ride-request.cancelled': () =>");
    expect(source).toContain("'trip.updated': () =>");
  });

  it('keeps cancellation compensation admin proxy guarded', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/support-tickets/[ticketId]/cancellation-compensation/route.ts',
      ),
      'utf8',
    );

    expect(source).toContain('isSafeAdminMutationRequest');
    expect(source).toContain('isSafeOpaqueAdminId');
    expect(source).toContain('approveAdminCancellationCompensation');
    expect(source).toContain('createNoStoreAdminHeaders');
  });
});
