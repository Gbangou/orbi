import { NextResponse, type NextRequest } from 'next/server';
import {
  createAdminPromoCode,
  listAdminPromoCodes,
} from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
} from '../../../admin-server-security';
import { normalizePromoCodePayload } from './promo-code-normalizers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await listAdminPromoCodes(authClient);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to load promo codes.',
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizePromoCodePayload(
    await request.json().catch(() => null),
  );

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid promo code request.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await createAdminPromoCode(authClient, payload);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to create promo code.',
    );
  }
}
