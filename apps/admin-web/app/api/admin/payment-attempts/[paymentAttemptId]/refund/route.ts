import { NextResponse, type NextRequest } from 'next/server';
import { refundAdminPaymentAttempt } from '@orbi/api';
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
  context: { params: Promise<{ paymentAttemptId: string }> },
) {
  const { paymentAttemptId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(paymentAttemptId)) {
    return NextResponse.json(
      { message: 'Invalid payment attempt identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await refundAdminPaymentAttempt(
      authClient,
      paymentAttemptId,
      {
        reason: 'Remboursement ops depuis le journal webhooks.',
      },
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to refund payment attempt.',
    );
  }
}
