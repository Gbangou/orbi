import { NextResponse, type NextRequest } from 'next/server';
import { recordAdminDriverWalletRecoveryAdjustment } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

function isSafePositiveAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ walletId: string }> },
) {
  const { walletId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(walletId)) {
    return NextResponse.json(
      { message: 'Invalid wallet identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = (await request.json().catch(() => null)) as {
    amount?: unknown;
  } | null;

  const recoveryAmount = payload?.amount;

  if (!isSafePositiveAmount(recoveryAmount)) {
    return NextResponse.json(
      { message: 'Invalid recovery amount.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await recordAdminDriverWalletRecoveryAdjustment(
      authClient,
      walletId,
      {
        amount: recoveryAmount,
        notes: 'Recouvrement terrain confirme depuis la console ops.',
        idempotencyKey: `recovery-${walletId}-${Date.now()}`,
      },
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to record driver wallet recovery.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
