import { NextResponse } from 'next/server';
import { fetchAdminDriverOnboardingQueue } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../admin-server-auth';
import { createNoStoreAdminHeaders } from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminDriverOnboardingQueue(authClient);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to fetch driver onboarding queue.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
