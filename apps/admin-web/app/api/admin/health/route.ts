import { NextResponse } from 'next/server';
import { createOrbiApiClient, fetchHealthCheck } from '@orbi/api';
import { orbiRuntimeConfig } from '@orbi/config';
import { createNoStoreAdminHeaders } from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = createOrbiApiClient(orbiRuntimeConfig.apiBaseUrl, {
      version: orbiRuntimeConfig.apiVersion,
    });
    const response = await fetchHealthCheck(client);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to fetch system health.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
