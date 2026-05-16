import { NextResponse } from 'next/server';
import { fetchAdminLiveOps } from '@mobilis/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../admin-server-auth';
import { createNoStoreAdminHeaders } from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminLiveOps(authClient);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to fetch admin live ops.',
    );
  }
}
