import { NextResponse, type NextRequest } from 'next/server';
import { acknowledgeAdminHealthIncident } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../../admin-server-auth';
import {
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
      { status: 403 },
    );
  }

  if (!isSafeOpaqueAdminId(incidentId)) {
    return NextResponse.json(
      { message: 'Invalid health incident identifier.' },
      { status: 400 },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await acknowledgeAdminHealthIncident(
      authClient,
      incidentId,
    );

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to acknowledge health incident.' },
      { status: 502 },
    );
  }
}
