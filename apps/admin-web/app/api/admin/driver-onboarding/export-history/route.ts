import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminDriverOnboardingExportHistory } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  resolveStrictBoundedInteger,
} from '../../../../admin-server-security';

export const dynamic = 'force-dynamic';

function boundedPageNumber(value: string | null, fallback: number) {
  return resolveStrictBoundedInteger(value, { min: 1, max: 100, fallback });
}

function boundedPageSize(value: string | null, fallback: number) {
  return resolveStrictBoundedInteger(value, { min: 1, max: 25, fallback });
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminDriverOnboardingExportHistory(authClient, {
      page: boundedPageNumber(request.nextUrl.searchParams.get('page'), 1),
      pageSize: boundedPageSize(request.nextUrl.searchParams.get('pageSize'), 6),
    });

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to fetch driver onboarding export history.',
    );
  }
}
