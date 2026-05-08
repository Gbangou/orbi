import { NextResponse, type NextRequest } from 'next/server';
import { requeueAdminJobQueueEntry } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../../admin-server-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;

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
