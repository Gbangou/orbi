import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminTripsExportCsv } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  resolveStrictBoundedInteger,
} from '../../../../admin-server-security';

export const dynamic = 'force-dynamic';

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

function resolveExportLimit(value: string | null) {
  return resolveStrictBoundedInteger(value, { min: 1, max: 500, fallback: 200 });
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function resolveIsoDate(value: string | null) {
  return value && isoDatePattern.test(value) ? value : undefined;
}

function resolveSearch(value: string | null) {
  const trimmed = value?.trim() ?? '';

  return trimmed.length > 0 ? trimmed.slice(0, 80) : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await getAdminServerAuthClient();
    const csv = await fetchAdminTripsExportCsv(authClient, {
      status: resolveTripStatus(request.nextUrl.searchParams.get('status')),
      limit: resolveExportLimit(request.nextUrl.searchParams.get('limit')),
      fromDate: resolveIsoDate(request.nextUrl.searchParams.get('fromDate')),
      toDate: resolveIsoDate(request.nextUrl.searchParams.get('toDate')),
      search: resolveSearch(request.nextUrl.searchParams.get('search')),
    });

    return new NextResponse(csv, {
      headers: {
        ...createNoStoreAdminHeaders(),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="orbi-trips-export.csv"',
      },
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to export trips CSV.',
    );
  }
}
