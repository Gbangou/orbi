import { NextResponse, type NextRequest } from 'next/server';
import { markAdminDriverPayoutPaid } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ payoutId: string }> },
) {
  const { payoutId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(payoutId)) {
    return NextResponse.json(
      { message: 'Invalid payout identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await markAdminDriverPayoutPaid(authClient, payoutId, {
      notes: 'Paiement terrain confirme depuis la console ops.',
    });

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to mark driver payout paid.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
