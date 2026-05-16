import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return collectRouteFiles(fullPath);
    }

    return entry === 'route.ts' ? [fullPath] : [];
  });
}

function relativeRoutePath(routeFile: string) {
  return relative(process.cwd(), routeFile).split(sep).join('/');
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

  it('keeps every admin server mutation behind the same-origin mutation guard', () => {
    const routeFiles = collectRouteFiles(join(process.cwd(), 'app/api/admin'));
    const mutationRoutes = routeFiles.filter((routeFile) =>
      /export async function (POST|PUT|PATCH|DELETE)\b/.test(
        readFileSync(routeFile, 'utf8'),
      ),
    );

    expect(mutationRoutes.map((routeFile) => relativeRoutePath(routeFile)))
      .toEqual(expect.arrayContaining([
        'app/api/admin/driver-payouts/[payoutId]/paid/route.ts',
        'app/api/admin/payment-attempts/[paymentAttemptId]/refund/route.ts',
        'app/api/admin/payment-webhook-events/[eventId]/replay/route.ts',
      ]));

    const unguardedRoutes = mutationRoutes
      .filter(
        (routeFile) =>
          !readFileSync(routeFile, 'utf8').includes(
            'isSafeAdminMutationRequest',
          ),
      )
      .map((routeFile) => relativeRoutePath(routeFile));

    expect(unguardedRoutes).toEqual([]);
  });

  it('bounds dynamic admin mutation identifiers before proxying to backend', () => {
    const routeFiles = collectRouteFiles(join(process.cwd(), 'app/api/admin'));
    const dynamicMutationRoutes = routeFiles.filter((routeFile) => {
      const source = readFileSync(routeFile, 'utf8');

      return (
        routeFile.includes('[') &&
        /export async function (POST|PUT|PATCH|DELETE)\b/.test(source)
      );
    });

    const unboundedRoutes = dynamicMutationRoutes
      .filter(
        (routeFile) =>
          !readFileSync(routeFile, 'utf8').includes('isSafeOpaqueAdminId'),
      )
      .map((routeFile) => relativeRoutePath(routeFile));

    expect(unboundedRoutes).toEqual([]);
  });
});
