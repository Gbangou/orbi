import {
  clearPersistedSession,
  createOrbiApiClient,
  persistSessionToken,
  restorePersistedSession,
  signInWithApi,
  signOutWithApi,
  signUpWithApi,
} from '@orbi/api';
import {
  orbiRuntimeConfig,
  resolveOrbiApiBaseUrlForRuntime,
} from '@orbi/config';
import type { AuthenticatedApiContext } from '@orbi/api';
import { flushDriverMobileErrorReports } from './mobile-error-reporting';
import { driverSessionStorage, driverSessionStorageKey } from './session-storage';

function createDriverClient() {
  return createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
    version: orbiRuntimeConfig.apiVersion,
  });
}

export async function restoreDriverSession() {
  const context = await restorePersistedSession(
    createDriverClient(),
    driverSessionStorage,
    driverSessionStorageKey,
  );
  safelyFlushDriverMobileErrorReports(context);

  return context;
}

export async function signInDriverAccount(payload: {
  email: string;
  password: string;
}) {
  const client = createDriverClient();
  const session = await signInWithApi(client, payload);
  await persistSessionToken(
    driverSessionStorage,
    driverSessionStorageKey,
    session.sessionToken,
  );

  const context = await restorePersistedSession(
    client,
    driverSessionStorage,
    driverSessionStorageKey,
  );
  safelyFlushDriverMobileErrorReports(context);

  return context;
}

export async function signUpDriverAccount(payload: {
  fullName: string;
  email: string;
  password: string;
}) {
  const client = createDriverClient();
  const session = await signUpWithApi(client, {
    ...payload,
    role: 'DRIVER',
  });
  await persistSessionToken(
    driverSessionStorage,
    driverSessionStorageKey,
    session.sessionToken,
  );

  const context = await restorePersistedSession(
    client,
    driverSessionStorage,
    driverSessionStorageKey,
  );
  safelyFlushDriverMobileErrorReports(context);

  return context;
}

export async function signOutDriverAccount() {
  try {
    const context = await restoreDriverSession();
    await signOutWithApi(context.authClient);
  } finally {
    await clearDriverPersistedSession();
  }
}

export async function hasPersistedDriverSession() {
  const token = await driverSessionStorage.getItem(driverSessionStorageKey);
  return Boolean(token);
}

export async function clearDriverPersistedSession() {
  await clearPersistedSession(driverSessionStorage, driverSessionStorageKey);
}

function safelyFlushDriverMobileErrorReports(context: AuthenticatedApiContext) {
  void flushDriverMobileErrorReports(context.authClient).catch(() => undefined);
}
