import { NextResponse, type NextRequest } from 'next/server';
import { muteAdminHealthIncident } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await context.params;

  if (!isSafeAdminMutationRequest(_request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(incidentId)) {
    return NextResponse.json(
      { message: 'Invalid health incident identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await muteAdminHealthIncident(authClient, incidentId);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to mute health incident.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
