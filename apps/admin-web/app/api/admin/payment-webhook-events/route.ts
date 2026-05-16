import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminPaymentWebhookEvents } from '@mobilis/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  resolvePaymentWebhookJournalKind,
} from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminPaymentWebhookEvents(authClient, {
      page: 1,
      pageSize: 8,
      kind: resolvePaymentWebhookJournalKind(
        request.nextUrl.searchParams.get('kind'),
      ),
    });

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to fetch payment webhook journal.',
    );
  }
}
