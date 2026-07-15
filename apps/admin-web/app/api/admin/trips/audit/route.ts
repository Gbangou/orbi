import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminTripsAudit } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  resolveStrictBoundedInteger,
} from '../../../../admin-server-security';

export const dynamic = 'force-dynamic';

function resolveLookbackHours(value: string | null) {
  return resolveStrictBoundedInteger(value, { min: 1, max: 168, fallback: 24 });
}

const tripStatuses = new Set([
  'MATCHED',
  'DRIVER_ARRIVING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

function resolveTripStatus(value: string | null) {
  return tripStatuses.has(value ?? '')
    ? (value as
        | 'MATCHED'
        | 'DRIVER_ARRIVING'
        | 'IN_PROGRESS'
        | 'COMPLETED'
        | 'CANCELLED')
    : undefined;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function resolveIsoDate(value: string | null) {
  return value && isoDatePattern.test(value) ? value : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminTripsAudit(authClient, {
      lookbackHours: resolveLookbackHours(
        request.nextUrl.searchParams.get('lookbackHours'),
      ),
      status: resolveTripStatus(request.nextUrl.searchParams.get('status')),
      fromDate: resolveIsoDate(request.nextUrl.searchParams.get('fromDate')),
      toDate: resolveIsoDate(request.nextUrl.searchParams.get('toDate')),
    });

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to fetch trips audit.',
    );
  }
}
