import { NextResponse, type NextRequest } from 'next/server';
import { buildAdminDriverPayoutSettlementPdfUrl } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthSession,
} from '../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  resolveDriverPayoutSettlementStatus,
} from '../../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const status = resolveDriverPayoutSettlementStatus(
    request.nextUrl.searchParams.get('status'),
  );

  try {
    const { authClient, sessionToken } = await getAdminServerAuthSession();
    const response = await fetch(
      authClient.endpoint(buildAdminDriverPayoutSettlementPdfUrl(status)),
      {
        headers: {
          Accept: 'application/pdf',
          Authorization: `Bearer ${sessionToken}`,
        },
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      throw new Error('Export failed');
    }

    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        ...createNoStoreAdminHeaders(),
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="orbi-driver-payout-settlement.pdf"',
      },
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to export driver payout settlement PDF.',
    );
  }
}
