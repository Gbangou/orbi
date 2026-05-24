import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminTripsExportCsv } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../admin-server-auth';
import { createNoStoreAdminHeaders } from '../../../../admin-server-security';

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
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 500
    ? parsed
    : 200;
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await getAdminServerAuthClient();
    const csv = await fetchAdminTripsExportCsv(authClient, {
      status: resolveTripStatus(request.nextUrl.searchParams.get('status')),
      limit: resolveExportLimit(request.nextUrl.searchParams.get('limit')),
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
