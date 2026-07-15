import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminDriverOnboardingExportCsv } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  resolveStrictBoundedInteger,
} from '../../../../admin-server-security';

export const dynamic = 'force-dynamic';

const guidanceFilters = new Set(['all', 'approve', 'review', 'resubmit']);

function resolveGuidanceFilter(value: string | null) {
  return guidanceFilters.has(value ?? '')
    ? (value as 'all' | 'approve' | 'review' | 'resubmit')
    : 'all';
}

function resolveSearchQuery(value: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, 120);
}

function resolveExportLimit(value: string | null) {
  return resolveStrictBoundedInteger(value, { min: 1, max: 100, fallback: 100 });
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await getAdminServerAuthClient();
    const csv = await fetchAdminDriverOnboardingExportCsv(authClient, {
      guidanceFilter: resolveGuidanceFilter(
        request.nextUrl.searchParams.get('guidanceFilter'),
      ),
      searchQuery: resolveSearchQuery(
        request.nextUrl.searchParams.get('searchQuery'),
      ),
      limit: resolveExportLimit(request.nextUrl.searchParams.get('limit')),
    });

    return new NextResponse(csv, {
      headers: {
        ...createNoStoreAdminHeaders(),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="orbi-driver-onboarding-export.csv"',
      },
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to export driver onboarding CSV.',
    );
  }
}
