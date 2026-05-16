import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminJobQueue } from '@mobilis/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  resolveAdminJobQueueKind,
  resolveAdminJobQueuePageNumber,
  resolveAdminJobQueuePageSize,
  resolveAdminJobQueueStatus,
} from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminJobQueue(authClient, {
      page: resolveAdminJobQueuePageNumber(params.get('page')),
      pageSize: resolveAdminJobQueuePageSize(params.get('pageSize')),
      kind: resolveAdminJobQueueKind(params.get('kind')),
      status: resolveAdminJobQueueStatus(params.get('status')),
    });

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to fetch admin job queue.',
    );
  }
}
