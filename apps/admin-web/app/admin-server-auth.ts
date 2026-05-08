import 'server-only';

import {
  createMobilisApiClient,
  fetchCurrentUser,
  signInWithApi,
  type MobilisApiClient,
} from '@mobilis/api';
import { mobilisDemoAccounts, mobilisRuntimeConfig } from '@mobilis/config';
import { cookies } from 'next/headers';

const adminSessionCookieName = 'mobilis_admin_session';
const adminSessionMaxAgeSeconds = 60 * 60 * 8;
const adminRoles = new Set(['ADMIN', 'OPS', 'SUPPORT']);

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

export async function getAdminServerAuthClient() {
  const cookieStore = await cookies();
  const baseClient = createAdminBaseClient();
  const existingToken = cookieStore.get(adminSessionCookieName)?.value;

  if (existingToken) {
    const authClient = baseClient.withAuthToken(existingToken);

    if (await isUsableAdminSession(authClient)) {
      return authClient;
    }
  }

  const session = await signInWithApi(baseClient, mobilisDemoAccounts.admin);

  cookieStore.set(adminSessionCookieName, session.sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: adminSessionMaxAgeSeconds,
  });

  return baseClient.withAuthToken(session.sessionToken);
}
