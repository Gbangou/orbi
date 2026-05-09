import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
  resolveDriverPayoutSettlementStatus,
  resolvePaymentWebhookJournalKind,
} from '../app/admin-server-security';
import { resolveSafeDocumentUrl } from '../app/admin-url-security';

function request(headers: Record<string, string>, method = 'POST') {
  return {
    method,
    nextUrl: {
      origin: 'http://localhost:3001',
    },
    headers: new Headers(headers),
  };
}

describe('admin server security', () => {
  it('requires an explicit same-origin admin mutation header', () => {
    expect(
      isSafeAdminMutationRequest(
        request({
          [adminMutationHeaderName]: adminMutationHeaderValue,
          origin: 'http://localhost:3001',
          'sec-fetch-site': 'same-origin',
        }) as never,
      ),
    ).toBe(true);

    expect(
      isSafeAdminMutationRequest(
        request({
          origin: 'http://localhost:3001',
          'sec-fetch-site': 'same-origin',
        }) as never,
      ),
    ).toBe(false);
  });

  it('rejects cross-site admin mutations even with the custom header present', () => {
    expect(
      isSafeAdminMutationRequest(
        request({
          [adminMutationHeaderName]: adminMutationHeaderValue,
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        }) as never,
      ),
    ).toBe(false);
  });

  it('allows safe read methods without a mutation header', () => {
    expect(isSafeAdminMutationRequest(request({}, 'GET') as never)).toBe(true);
  });

  it('bounds opaque route identifiers before proxying to the backend', () => {
    expect(isSafeOpaqueAdminId('job-dead-1')).toBe(true);
    expect(isSafeOpaqueAdminId('clv1234567890abcdef')).toBe(true);
    expect(isSafeOpaqueAdminId('../job-dead-1')).toBe(false);
    expect(isSafeOpaqueAdminId('<script>')).toBe(false);
    expect(isSafeOpaqueAdminId('a'.repeat(120))).toBe(false);
  });

  it('uses no-store headers for admin proxy responses', () => {
    expect(createNoStoreAdminHeaders()).toEqual({
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    });
  });

  it('bounds driver payout settlement status before proxying exports', () => {
    expect(resolveDriverPayoutSettlementStatus('PAID')).toBe('PAID');
    expect(resolveDriverPayoutSettlementStatus('CANCELLED')).toBe('CANCELLED');
    expect(resolveDriverPayoutSettlementStatus('<script>')).toBe('PREPARED');
    expect(resolveDriverPayoutSettlementStatus(null)).toBe('PREPARED');
  });

  it('bounds payment webhook journal kind before proxying filters', () => {
    expect(resolvePaymentWebhookJournalKind('payment')).toBe('payment');
    expect(resolvePaymentWebhookJournalKind('refund')).toBe('refund');
    expect(resolvePaymentWebhookJournalKind('ignored')).toBe('ignored');
    expect(resolvePaymentWebhookJournalKind('all')).toBeUndefined();
    expect(resolvePaymentWebhookJournalKind('../ignored')).toBeUndefined();
  });

  it('allows only safe document view URLs for admin links', () => {
    expect(resolveSafeDocumentUrl('https://storage.mobilis.app/view/doc')).toBe(
      'https://storage.mobilis.app/view/doc',
    );
    expect(resolveSafeDocumentUrl('http://localhost:9000/view/doc')).toBe(
      'http://localhost:9000/view/doc',
    );
    expect(resolveSafeDocumentUrl('javascript:alert(1)')).toBeNull();
    expect(resolveSafeDocumentUrl('data:text/html,<script>')).toBeNull();
    expect(resolveSafeDocumentUrl('/api/admin/document')).toBeNull();
  });
});
