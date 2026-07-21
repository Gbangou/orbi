import { NextResponse, type NextRequest } from 'next/server';
import { approveAdminCancellationCompensation } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(ticketId)) {
    return NextResponse.json(
      { message: 'Invalid support ticket identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await approveAdminCancellationCompensation(
      authClient,
      ticketId,
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to approve cancellation compensation.',
    );
  }
}
