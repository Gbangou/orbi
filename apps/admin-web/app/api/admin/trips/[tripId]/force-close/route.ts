import { NextResponse, type NextRequest } from 'next/server';
import {
  forceCloseAdminTrip,
  isOrbiApiError,
  updateTripStatusWithApi,
} from '@orbi/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
  isSafeOpaqueAdminId,
} from '../../../../../admin-server-security';

export const dynamic = 'force-dynamic';

function normalizeForceClosePayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as { reason?: unknown };
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';

  if (reason.length < 10 || reason.length > 500) {
    return null;
  }

  return { reason };
}

function shouldUseStatusCancellationFallback(error: unknown) {
  return isOrbiApiError(error) && (error.status === 404 || error.status === 405);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await context.params;

  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  if (!isSafeOpaqueAdminId(tripId)) {
    return NextResponse.json(
      { message: 'Invalid trip identifier.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizeForceClosePayload(
    await request.json().catch(() => null),
  );

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid trip force-close request.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    let response;

    try {
      response = await forceCloseAdminTrip(authClient, tripId, payload);
    } catch (error) {
      if (!shouldUseStatusCancellationFallback(error)) {
        throw error;
      }

      const fallback = await updateTripStatusWithApi(
        authClient,
        tripId,
        'CANCELLED',
        payload.reason,
      );

      response = {
        tripId: fallback.trip.id,
        rideRequestId: fallback.trip.rideRequestId,
        riderId: '',
        driverId: '',
        status: fallback.trip.status,
        cancelledBy: 'ADMIN',
        changed: fallback.trip.status === 'CANCELLED',
        message:
          'Trip closed through status cancellation fallback. Rider and driver can be matched again.',
      };
    }

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to force-close trip.',
    );
  }
}
