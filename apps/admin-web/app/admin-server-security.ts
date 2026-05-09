import type { NextRequest } from 'next/server';

export const adminMutationHeaderName = 'x-mobilis-admin-action';
export const adminMutationHeaderValue = 'true';

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,96}$/;
const driverPayoutSettlementStatuses = new Set([
  'PREPARED',
  'PAID',
  'CANCELLED',
]);
const adminNoStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

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

export function createNoStoreAdminHeaders() {
  return adminNoStoreHeaders;
}
