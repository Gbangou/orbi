import { NextResponse, type NextRequest } from 'next/server';
import {
  createAdminPromoCode,
  listAdminPromoCodes,
  type CreateAdminPromoCodePayload,
} from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
} from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

function normalizePromoCodePayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, 200)
      : undefined;

  if (code.length < 3 || code.length > 32) {
    return null;
  }

  if (
    typeof input.discountBps !== 'number' ||
    !Number.isInteger(input.discountBps) ||
    input.discountBps < 1 ||
    input.discountBps > 10000
  ) {
    return null;
  }

  if (
    input.maxUses !== undefined &&
    (typeof input.maxUses !== 'number' ||
      !Number.isInteger(input.maxUses) ||
      input.maxUses < 1 ||
      input.maxUses > 100000)
  ) {
    return null;
  }

  if (
    typeof input.validFrom !== 'string' ||
    Number.isNaN(Date.parse(input.validFrom)) ||
    typeof input.validTo !== 'string' ||
    Number.isNaN(Date.parse(input.validTo))
  ) {
    return null;
  }

  if (
    input.firstTripOnly !== undefined &&
    typeof input.firstTripOnly !== 'boolean'
  ) {
    return null;
  }

  const payload: CreateAdminPromoCodePayload = {
    code,
    discountBps: input.discountBps,
    validFrom: input.validFrom,
    validTo: input.validTo,
    firstTripOnly:
      typeof input.firstTripOnly === 'boolean' ? input.firstTripOnly : true,
  };

  if (description) {
    payload.description = description;
  }

  if (typeof input.maxUses === 'number') {
    payload.maxUses = input.maxUses;
  }

  return payload;
}

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
