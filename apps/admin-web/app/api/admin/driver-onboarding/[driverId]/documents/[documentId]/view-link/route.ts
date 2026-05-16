import { NextResponse, type NextRequest } from 'next/server';
import { fetchAdminDriverDocumentViewLink } from '@mobilis/api';
import { getAdminServerAuthClient } from '../../../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeOpaqueAdminId,
} from '../../../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ driverId: string; documentId: string }> },
) {
  const { driverId, documentId } = await context.params;

  if (!isSafeOpaqueAdminId(driverId) || !isSafeOpaqueAdminId(documentId)) {
    return NextResponse.json(
      { message: 'Invalid driver document identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminDriverDocumentViewLink(
      authClient,
      driverId,
      documentId,
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Unable to create driver document view link.' },
      { status: 502, headers: createNoStoreAdminHeaders() },
    );
  }
}
