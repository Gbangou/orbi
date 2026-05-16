import { NextResponse, type NextRequest } from 'next/server';
import { acknowledgeAdminLaunchReadinessAction } from '@mobilis/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

const launchReadinessOwners = new Set([
  'ops',
  'engineering',
  'support',
  'finance',
]);

type LaunchReadinessOwner = 'ops' | 'engineering' | 'support' | 'finance';

function normalizeAcknowledgementPayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;

  if (!launchReadinessOwners.has(input.owner as string)) {
    return null;
  }

  if (typeof input.notes !== 'string') {
    return null;
  }

  const notes = input.notes.trim();

  if (!notes || notes.length > 500) {
    return null;
  }

  if (
    input.idempotencyKey !== undefined &&
    (typeof input.idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey))
  ) {
    return null;
  }

  return {
    owner: input.owner as LaunchReadinessOwner,
    notes,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ checkId: string }> },
) {
  const { checkId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(checkId)) {
    return NextResponse.json(
      { message: 'Invalid launch readiness check identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizeAcknowledgementPayload(
    await request.json().catch(() => null),
  );

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid launch readiness acknowledgement.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await acknowledgeAdminLaunchReadinessAction(
      authClient,
      checkId,
      payload,
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to acknowledge launch readiness action.',
    );
  }
}
