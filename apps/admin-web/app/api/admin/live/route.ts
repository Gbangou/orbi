import { NextResponse } from 'next/server';
import {
  apiRoutes,
  createMobilisApiClient,
  signInWithApi,
} from '@mobilis/api';
import { mobilisDemoAccounts, mobilisRuntimeConfig } from '@mobilis/config';
import { createNoStoreAdminHeaders } from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
    version: mobilisRuntimeConfig.apiVersion,
  });

  try {
    const session = await signInWithApi(client, mobilisDemoAccounts.admin);
    const response = await fetch(
      client.endpoint(apiRoutes.admin.stream, {
        sessionToken: session.sessionToken,
      }),
      {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
      },
    );

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { message: 'Unable to open backend realtime stream.' },
        { status: 502, headers: createNoStoreAdminHeaders() },
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store, no-cache, no-transform',
        Pragma: 'no-cache',
        Expires: '0',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to authenticate admin realtime stream.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
