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
import { flushRiderMobileErrorReports } from './mobile-error-reporting';
import { riderSessionStorage, riderSessionStorageKey } from './session-storage';

export function createRiderPublicClient() {
  return createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
    version: orbiRuntimeConfig.apiVersion,
  });
}

export async function restoreRiderSession() {
  const context = await restorePersistedSession(
    createRiderPublicClient(),
    riderSessionStorage,
    riderSessionStorageKey,
  );
  safelyFlushRiderMobileErrorReports(context);

  return context;
}

export async function signInRiderAccount(payload: {
  email: string;
  password: string;
}) {
  const client = createRiderPublicClient();
  const session = await signInWithApi(client, payload);
  await persistSessionToken(
    riderSessionStorage,
    riderSessionStorageKey,
    session.sessionToken,
  );

  const context = await restorePersistedSession(
    client,
    riderSessionStorage,
    riderSessionStorageKey,
  );
  safelyFlushRiderMobileErrorReports(context);

  return context;
}

export async function signUpRiderAccount(payload: {
  fullName: string;
  email: string;
  password: string;
}) {
  const client = createRiderPublicClient();
  const session = await signUpWithApi(client, {
    ...payload,
    role: 'RIDER',
  });
  await persistSessionToken(
    riderSessionStorage,
    riderSessionStorageKey,
    session.sessionToken,
  );

  const context = await restorePersistedSession(
    client,
    riderSessionStorage,
    riderSessionStorageKey,
  );
  safelyFlushRiderMobileErrorReports(context);

  return context;
}

export async function signOutRiderAccount() {
  try {
    const context = await restoreRiderSession();
    await signOutWithApi(context.authClient);
  } finally {
    await clearRiderPersistedSession();
  }
}

export async function hasPersistedRiderSession() {
  const token = await riderSessionStorage.getItem(riderSessionStorageKey);
  return Boolean(token);
}

export async function clearRiderPersistedSession() {
  await clearPersistedSession(riderSessionStorage, riderSessionStorageKey);
}

function safelyFlushRiderMobileErrorReports(context: AuthenticatedApiContext) {
  void flushRiderMobileErrorReports(context.authClient).catch(() => undefined);
}
