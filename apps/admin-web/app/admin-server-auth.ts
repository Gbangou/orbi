import 'server-only';

import {
  createMobilisApiClient,
  fetchCurrentUser,
  signInWithApi,
  type MobilisApiClient,
} from '@mobilis/api';
import {
  mobilisDemoAccessEnabled,
  mobilisDemoAccounts,
  mobilisRuntimeConfig,
} from '@mobilis/config';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createNoStoreAdminHeaders } from './admin-server-security';

const legacyAdminSessionCookieName = 'mobilis_admin_session';
const hardenedAdminSessionCookieName = '__Host-mobilis_admin_session';
const adminSessionMaxAgeSeconds = 60 * 60 * 8;
const adminRoles = new Set(['ADMIN', 'OPS', 'SUPPORT']);

export class AdminServerAuthRequiredError extends Error {
  constructor() {
    super('Admin session is required.');
    this.name = 'AdminServerAuthRequiredError';
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

export function getAdminSessionCookieName() {
  return isProductionRuntime()
    ? hardenedAdminSessionCookieName
    : legacyAdminSessionCookieName;
}

export function buildAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isProductionRuntime(),
    path: '/',
    maxAge: adminSessionMaxAgeSeconds,
    priority: 'high' as const,
  };
}

export function canUseAdminDemoAccess() {
  return mobilisDemoAccessEnabled;
}

export function isAdminServerAuthRequiredError(
  error: unknown,
): error is AdminServerAuthRequiredError {
  return error instanceof AdminServerAuthRequiredError;
}

export function createAdminServerAuthErrorResponse(
  error: unknown,
  fallbackMessage: string,
) {
  if (isAdminServerAuthRequiredError(error)) {
    return NextResponse.json(
      { message: 'Admin session is required.' },
      { status: 401, headers: createNoStoreAdminHeaders() },
    );
  }

  return NextResponse.json(
    { message: fallbackMessage },
    { status: 502, headers: createNoStoreAdminHeaders() },
  );
}

function createAdminBaseClient() {
  return createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
    version: mobilisRuntimeConfig.apiVersion,
  });
}

async function isUsableAdminSession(authClient: MobilisApiClient) {
  try {
    const me = await fetchCurrentUser(authClient);

    return adminRoles.has(me.user.role);
  } catch {
    return false;
  }
}

export async function getAdminServerAuthSession() {
  const cookieStore = await cookies();
  const baseClient = createAdminBaseClient();
  const activeCookieName = getAdminSessionCookieName();
  const legacyToken = cookieStore.get(legacyAdminSessionCookieName)?.value;
  const existingToken =
    cookieStore.get(activeCookieName)?.value ?? legacyToken;

  if (existingToken) {
    const authClient = baseClient.withAuthToken(existingToken);

    if (await isUsableAdminSession(authClient)) {
      if (isProductionRuntime() && legacyToken) {
        cookieStore.delete(legacyAdminSessionCookieName);
      }

      return {
        authClient,
        sessionToken: existingToken,
      };
    }
  }

  if (!canUseAdminDemoAccess()) {
    if (isProductionRuntime() && legacyToken) {
      cookieStore.delete(legacyAdminSessionCookieName);
    }

    throw new AdminServerAuthRequiredError();
  }

  const session = await signInWithApi(baseClient, mobilisDemoAccounts.admin);

  if (isProductionRuntime() && legacyToken) {
    cookieStore.delete(legacyAdminSessionCookieName);
  }

  cookieStore.set(
    activeCookieName,
    session.sessionToken,
    buildAdminSessionCookieOptions(),
  );

  return {
    authClient: baseClient.withAuthToken(session.sessionToken),
    sessionToken: session.sessionToken,
  };
}

export async function getAdminServerAuthClient() {
  const session = await getAdminServerAuthSession();

  return session.authClient;
}
