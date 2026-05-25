import { NextResponse, type NextRequest } from 'next/server';
import { updateAdminRiderStatus } from '@orbi/api';
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

function normalizePayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as { isActive?: unknown; reason?: unknown };

  if (typeof input.isActive !== 'boolean') {
    return null;
  }

  return {
    isActive: input.isActive,
    reason:
      typeof input.reason === 'string' && input.reason.trim()
        ? input.reason.trim().slice(0, 400)
        : undefined,
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(userId)) {
    return NextResponse.json(
      { message: 'Invalid rider identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizePayload(await request.json().catch(() => null));

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid rider status update.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await updateAdminRiderStatus(authClient, userId, payload);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to update rider status.',
    );
  }
}
