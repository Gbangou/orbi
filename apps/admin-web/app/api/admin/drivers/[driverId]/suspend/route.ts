import { NextResponse, type NextRequest } from 'next/server';
import { suspendAdminDriver } from '@orbi/api';
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

function normalizeSuspensionPayload(value: unknown) {
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
  context: { params: Promise<{ driverId: string }> },
) {
  const { driverId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(driverId)) {
    return NextResponse.json(
      { message: 'Invalid driver identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizeSuspensionPayload(
    await request.json().catch(() => null),
  );

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid driver suspension request.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await suspendAdminDriver(
      authClient,
      driverId,
      payload.reason,
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to suspend driver.',
    );
  }
}
