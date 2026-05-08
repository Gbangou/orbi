import { NextResponse, type NextRequest } from 'next/server';
import { requeueAdminJobQueueEntry } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../../admin-server-auth';
import {
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;

  if (!isSafeAdminMutationRequest(_request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403 },
    );
  }

  if (!isSafeOpaqueAdminId(jobId)) {
    return NextResponse.json(
      { message: 'Invalid job identifier.' },
      { status: 400 },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await requeueAdminJobQueueEntry(authClient, jobId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to requeue job.' },
      { status: 502 },
    );
  }
}
