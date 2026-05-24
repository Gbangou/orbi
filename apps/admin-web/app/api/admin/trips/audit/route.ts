import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminTripsAudit } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../admin-server-auth';
import { createNoStoreAdminHeaders } from '../../../../admin-server-security';

export const dynamic = 'force-dynamic';

function resolveLookbackHours(value: string | null) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 168
    ? parsed
    : 24;
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminTripsAudit(authClient, {
      lookbackHours: resolveLookbackHours(
        request.nextUrl.searchParams.get('lookbackHours'),
      ),
    });

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to fetch trips audit.',
    );
  }
}
