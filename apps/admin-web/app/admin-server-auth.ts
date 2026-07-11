import 'server-only';

import {
  createOrbiApiClient,
  fetchCurrentUser,
  signInWithApi,
  type OrbiApiClient,
} from '@orbi/api';
import {
  orbiDemoAccessEnabled,
  orbiDemoAccounts,
  orbiRuntimeConfig,
} from '@orbi/config';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createNoStoreAdminHeaders } from './admin-server-security';

const legacyAdminSessionCookieName = 'orbi_admin_session';
const hardenedAdminSessionCookieName = '__Host-orbi_admin_session';
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
  return orbiDemoAccessEnabled;
}

export function isAdminRole(role: string) {
  return adminRoles.has(role);
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
  return createOrbiApiClient(orbiRuntimeConfig.apiBaseUrl, {
    version: orbiRuntimeConfig.apiVersion,
  });
}

async function isUsableAdminSession(authClient: OrbiApiClient) {
  try {
    const me = await fetchCurrentUser(authClient);

    return adminRoles.has(me.user.role);
  } catch {
    return false;
  }
}

// Next.js only allows cookies() writes from a Server Action or Route Handler —
// calling .set()/.delete() during a plain page render throws
// "Cookies can only be modified in a Server Action or Route Handler" and, left
// unguarded, that exception propagated all the way up and forced the whole
// admin dashboard into its "backend unreachable" fallback mode on every
// render that didn't already have a valid session cookie (i.e. every first
// visit, and every visit after the cookie's natural expiry) — confirmed live,
// not hypothetical. The write is best-effort persistence for the *next*
// request; the *current* request only needs the returned authClient/token, so
// a failed write must never fail the auth call itself.
function tryPersistCookieWrite(write: () => void) {
  try {
    write();
  } catch {
    // Best-effort only — see comment above.
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
        tryPersistCookieWrite(() =>
          cookieStore.delete(legacyAdminSessionCookieName),
        );
      }

      return {
        authClient,
        sessionToken: existingToken,
      };
    }
  }

  if (!canUseAdminDemoAccess()) {
    if (isProductionRuntime() && legacyToken) {
      tryPersistCookieWrite(() =>
        cookieStore.delete(legacyAdminSessionCookieName),
      );
    }

    throw new AdminServerAuthRequiredError();
  }

  const session = await signInWithApi(baseClient, orbiDemoAccounts.admin);

  if (isProductionRuntime() && legacyToken) {
    tryPersistCookieWrite(() =>
      cookieStore.delete(legacyAdminSessionCookieName),
    );
  }

  tryPersistCookieWrite(() =>
    cookieStore.set(
      activeCookieName,
      session.sessionToken,
      buildAdminSessionCookieOptions(),
    ),
  );

  return {
    authClient: baseClient.withAuthToken(session.sessionToken),
    sessionToken: session.sessionToken,
  };
}

export async function createAdminServerSessionFromCredentials(payload: {
  email: string;
  password: string;
}) {
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  if (!email || password.length < 8) {
    throw new AdminServerAuthRequiredError();
  }

  const cookieStore = await cookies();
  const baseClient = createAdminBaseClient();
  const session = await signInWithApi(baseClient, { email, password });
  const authClient = baseClient.withAuthToken(session.sessionToken);
  const me = await fetchCurrentUser(authClient);

  if (!isAdminRole(me.user.role)) {
    throw new AdminServerAuthRequiredError();
  }

  cookieStore.set(
    getAdminSessionCookieName(),
    session.sessionToken,
    buildAdminSessionCookieOptions(),
  );

  return {
    authClient,
    sessionToken: session.sessionToken,
    me,
  };
}

export async function clearAdminServerSession() {
  const cookieStore = await cookies();

  cookieStore.delete(getAdminSessionCookieName());
  cookieStore.delete(legacyAdminSessionCookieName);
}

export async function getAdminServerAuthClient() {
  const session = await getAdminServerAuthSession();

  return session.authClient;
}
