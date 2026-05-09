import { NextResponse, type NextRequest } from 'next/server';
import { buildAdminDriverPayoutSettlementCsvUrl } from '@mobilis/api';
import { getAdminServerAuthSession } from '../../../../admin-server-auth';
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
      authClient.endpoint(buildAdminDriverPayoutSettlementCsvUrl(status)),
      {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error('Export failed');
    }

    return new NextResponse(await response.text(), {
      headers: {
        ...createNoStoreAdminHeaders(),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="mobilis-driver-payout-settlement.csv"',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to export driver payout settlement CSV.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
