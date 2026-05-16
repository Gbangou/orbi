import { NextResponse, type NextRequest } from 'next/server';
import {
  fetchAdminDispatchSettings,
  updateAdminDispatchSettings,
} from '@mobilis/api';
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from '../../../admin-server-auth';
import {
  createNoStoreAdminHeaders,
  isSafeAdminMutationRequest,
} from '../../../admin-server-security';

export const dynamic = 'force-dynamic';

type DispatchSettingsPayload = {
  lookbackHours?: number;
  halfLifeHours?: number;
  declineCooldownMinutes?: number;
  historyLimit?: number;
  resetToDefaults?: boolean;
};

function isBoundedInteger(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function normalizeDispatchSettingsPayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const payload: DispatchSettingsPayload = {};

  if (input.resetToDefaults === true) {
    payload.resetToDefaults = true;
  }

  if (isBoundedInteger(input.lookbackHours, 6, 336)) {
    payload.lookbackHours = input.lookbackHours;
  } else if (input.lookbackHours !== undefined) {
    return null;
  }

  if (isBoundedInteger(input.halfLifeHours, 1, 168)) {
    payload.halfLifeHours = input.halfLifeHours;
  } else if (input.halfLifeHours !== undefined) {
    return null;
  }

  if (isBoundedInteger(input.declineCooldownMinutes, 1, 240)) {
    payload.declineCooldownMinutes = input.declineCooldownMinutes;
  } else if (input.declineCooldownMinutes !== undefined) {
    return null;
  }

  if (isBoundedInteger(input.historyLimit, 8, 200)) {
    payload.historyLimit = input.historyLimit;
  } else if (input.historyLimit !== undefined) {
    return null;
  }

  return Object.keys(payload).length ? payload : null;
}

export async function GET() {
  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminDispatchSettings(authClient);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to fetch dispatch settings.',
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSafeAdminMutationRequest(request)) {
    return NextResponse.json(
      { message: 'Forbidden admin mutation request.' },
      { status: 403, headers: createNoStoreAdminHeaders() },
    );
  }

  const payload = normalizeDispatchSettingsPayload(
    await request.json().catch(() => null),
  );

  if (!payload) {
    return NextResponse.json(
      { message: 'Invalid dispatch settings update.' },
      { status: 400, headers: createNoStoreAdminHeaders() },
    );
  }

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await updateAdminDispatchSettings(authClient, payload);

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      'Unable to update dispatch settings.',
    );
  }
}
