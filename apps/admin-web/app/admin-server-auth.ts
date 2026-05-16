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

const legacyAdminSessionCookieName = 'mobilis_admin_session';
const hardenedAdminSessionCookieName = '__Host-mobilis_admin_session';
const adminSessionMaxAgeSeconds = 60 * 60 * 8;
const adminRoles = new Set(['ADMIN', 'OPS', 'SUPPORT']);

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

    throw new Error(
      'Admin demo auto sign-in is disabled for this runtime.',
    );
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
