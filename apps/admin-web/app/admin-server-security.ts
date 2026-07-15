import type { NextRequest } from 'next/server';

export const adminMutationHeaderName = 'x-orbi-admin-action';
export const adminMutationHeaderValue = 'true';

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,96}$/;
const driverPayoutSettlementStatuses = new Set([
  'PREPARED',
  'PAID',
  'CANCELLED',
]);
const paymentWebhookJournalKinds = new Set([
  'payment',
  'refund',
  'ignored',
]);
const adminJobQueueKinds = new Set([
  'PAYMENT_WEBHOOK',
  'PAYMENT_REFUND_VERIFICATION',
  'DRIVER_DOCUMENT',
  'NOTIFICATION',
  'DRIVER_RESERVATION_EXPIRY',
]);
const adminJobQueueStatuses = new Set([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'DEAD_LETTER',
]);
const adminJobQueueMaxPageSize = 50;
const adminNoStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};
const strictIntegerPattern = /^[0-9]+$/;

type AdminRequestSecurityInput = Pick<NextRequest, 'headers' | 'method'> & {
  nextUrl: Pick<NextRequest['nextUrl'], 'origin'>;
};

export function isSafeAdminMutationRequest(request: AdminRequestSecurityInput) {
  const method = request.method.toUpperCase();

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const mutationHeader = request.headers.get(adminMutationHeaderName);

  if (mutationHeader !== adminMutationHeaderValue) {
    return false;
  }

  const origin = request.headers.get('origin');

  if (origin && origin !== request.nextUrl.origin) {
    return false;
  }

  const fetchSite = request.headers.get('sec-fetch-site');

  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return false;
  }

  return true;
}

export function isSafeOpaqueAdminId(value: string) {
  return opaqueIdPattern.test(value);
}

export function resolveDriverPayoutSettlementStatus(value: string | null) {
  if (driverPayoutSettlementStatuses.has(value ?? '')) {
    return value as 'PREPARED' | 'PAID' | 'CANCELLED';
  }

  return 'PREPARED';
}

export function resolvePaymentWebhookJournalKind(value: string | null) {
  if (paymentWebhookJournalKinds.has(value ?? '')) {
    return value as 'payment' | 'refund' | 'ignored';
  }

  return undefined;
}

export function resolveAdminJobQueueKind(value: string | null) {
  if (adminJobQueueKinds.has(value ?? '')) {
    return value as
      | 'PAYMENT_WEBHOOK'
      | 'PAYMENT_REFUND_VERIFICATION'
      | 'DRIVER_DOCUMENT'
      | 'NOTIFICATION'
      | 'DRIVER_RESERVATION_EXPIRY';
  }

  return undefined;
}

export function resolveAdminJobQueueStatus(value: string | null) {
  if (adminJobQueueStatuses.has(value ?? '')) {
    return value as 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'DEAD_LETTER';
  }

  return undefined;
}

export function resolveAdminJobQueuePageNumber(value: string | null) {
  return resolveStrictBoundedInteger(value, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  });
}

export function resolveAdminJobQueuePageSize(value: string | null) {
  return resolveStrictBoundedInteger(value, {
    min: 1,
    max: adminJobQueueMaxPageSize,
    clampMax: true,
  });
}

export function resolveStrictBoundedInteger(
  value: string | null,
  options: {
    min: number;
    max: number;
    fallback?: number;
    clampMax?: boolean;
  },
) {
  const trimmed = value?.trim() ?? '';

  if (!strictIntegerPattern.test(trimmed)) {
    return options.fallback;
  }

  const parsed = Number(trimmed);

  if (!Number.isSafeInteger(parsed) || parsed < options.min) {
    return options.fallback;
  }

  if (parsed > options.max) {
    return options.clampMax ? options.max : options.fallback;
  }

  return parsed;
}

export function createNoStoreAdminHeaders() {
  return adminNoStoreHeaders;
}
