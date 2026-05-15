import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminJobQueue, type AdminJobQueueKind } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../admin-server-auth';
import { createNoStoreAdminHeaders } from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

const allowedKinds = new Set([
  'PAYMENT_WEBHOOK',
  'DRIVER_DOCUMENT',
  'NOTIFICATION',
  'DRIVER_RESERVATION_EXPIRY',
]);
const allowedStatuses = new Set([
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'DEAD_LETTER',
]);

function parsePositiveInteger(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get('kind');
  const status = params.get('status');

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminJobQueue(authClient, {
      page: parsePositiveInteger(params.get('page')),
      pageSize: parsePositiveInteger(params.get('pageSize')),
      kind: allowedKinds.has(kind ?? '')
        ? (kind as AdminJobQueueKind)
        : undefined,
      status: allowedStatuses.has(status ?? '')
        ? (status as 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'DEAD_LETTER')
        : undefined,
    });

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to fetch admin job queue.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
