import { NextResponse } from 'next/server';
import { createMobilisApiClient, fetchHealthCheck } from '@mobilis/api';
import { mobilisRuntimeConfig } from '@mobilis/config';
import { createNoStoreAdminHeaders } from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
      version: mobilisRuntimeConfig.apiVersion,
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
