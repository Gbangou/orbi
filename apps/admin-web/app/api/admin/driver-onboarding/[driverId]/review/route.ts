import { NextResponse, type NextRequest } from 'next/server';
import { updateAdminDriverOnboardingReview } from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../admin-server-security';
import { normalizeReviewPayload } from './review-normalizers';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ driverId: string }> },
) {
  const { driverId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(driverId)) {
    return NextResponse.json(
      { message: 'Invalid driver identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizeReviewPayload(await request.json().catch(() => null));

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid driver onboarding review update.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await updateAdminDriverOnboardingReview(
      authClient,
      driverId,
      payload,
    );

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to update driver onboarding review.',
    );
  }
}
