/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('payment webhook journal board', () => {
  it('guards event money actions against duplicate clicks', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/payment-webhook-journal-board.tsx'),
      'utf8',
    );

    expect(source).toContain('eventActionInFlightRef');
    expect(source).toContain('eventActionInFlightRef.current.has(eventId)');
    expect(source).toContain('eventActionInFlightRef.current.add(eventId)');
    expect(source).toContain('eventActionInFlightRef.current.delete(eventId)');
    expect(source).toContain('if (!beginEventAction(eventId))');
  });

  it('only enables refunds for succeeded payment attempts', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/payment-webhook-journal-board.tsx'),
      'utf8',
    );

    expect(source).toContain("event.paymentAttempt?.status === 'SUCCEEDED'");
    expect(source).toContain('!canRefundPaymentAttempt(event)');
  });

  it('formats webhook payment amounts through the shared admin money helper', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/payment-webhook-journal-board.tsx'),
      'utf8',
    );

    expect(source).toContain('formatAdminMoney');
    expect(source).not.toContain('Math.round(event.paymentAttempt.amount)');
  });

  it('keeps the refund proxy guarded, no-store, and id-bounded', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/api/admin/payment-attempts/[paymentAttemptId]/refund/route.ts',
      ),
      'utf8',
    );

    expect(source).toContain('isSafeAdminMutationRequest');
    expect(source).toContain('isSafeOpaqueAdminId(paymentAttemptId)');
    expect(source).toContain('createNoStoreAdminHeaders()');
    expect(source).toContain('getAdminServerAuthClient');
    expect(source).toContain('createAdminServerAuthErrorResponse');
  });
});
