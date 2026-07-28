import { NextResponse, type NextRequest } from 'next/server';
import { forceCloseAdminTrip } from '@orbi/api';
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

function normalizeForceClosePayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as { reason?: unknown };
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';

  if (reason.length < 10 || reason.length > 500) {
    return null;
  }

  return { reason };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(tripId)) {
    return NextResponse.json(
      { message: 'Invalid trip identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizeForceClosePayload(
    await request.json().catch(() => null),
  );

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid trip force-close request.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await forceCloseAdminTrip(authClient, tripId, payload);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to force-close trip.',
    );
  }
}
