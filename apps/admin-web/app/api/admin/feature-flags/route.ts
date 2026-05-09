import { NextResponse } from 'next/server';
import { fetchAdminFeatureFlags } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../admin-server-auth';
import { createNoStoreAdminHeaders } from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminFeatureFlags(authClient);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to fetch admin feature flags.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
