import { NextResponse, type NextRequest } from 'next/server';
import { updateAdminSupportTicket } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../admin-server-security';

export const dynamic = 'force-dynamic';

const supportTicketStatuses = new Set([
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'CLOSED',
]);

function normalizeSupportTicketPayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as { status?: unknown; priority?: unknown };
  const payload: {
    status?: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
    priority?: number;
  } = {};

  if (supportTicketStatuses.has(input.status as string)) {
    payload.status = input.status as
      | 'OPEN'
      | 'IN_REVIEW'
      | 'RESOLVED'
      | 'CLOSED';
  }

  if (
    typeof input.priority === 'number' &&
    Number.isInteger(input.priority) &&
    input.priority >= 1 &&
    input.priority <= 3
  ) {
    payload.priority = input.priority;
  }

  return payload.status || payload.priority ? payload : null;
}

export async function PATCH(
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

  const payload = normalizeSupportTicketPayload(
    await request.json().catch(() => null),
  );

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid support ticket update.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await updateAdminSupportTicket(
      authClient,
      ticketId,
      payload,
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to update support ticket.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
