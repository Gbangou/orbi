import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdminDriverDocumentObjectWithProvider } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ driverId: string; documentId: string }> },
) {
  const { driverId, documentId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(driverId) || !isSafeOpaqueAdminId(documentId)) {
    return NextResponse.json(
      { message: 'Invalid driver document identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await verifyAdminDriverDocumentObjectWithProvider(
      authClient,
      driverId,
      documentId,
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to verify driver document object with provider.',
    );
  }
}
