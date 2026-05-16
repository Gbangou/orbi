import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminDriverOnboardingExportCsv } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../admin-server-auth';
import { createNoStoreAdminHeaders } from '../../../../admin-server-security';

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
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
    ? parsed
    : 100;
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
          'attachment; filename="mobilis-driver-onboarding-export.csv"',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to export driver onboarding CSV.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
