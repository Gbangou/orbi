import {
  clearPersistedSession,
  createMobilisApiClient,
  persistSessionToken,
  restorePersistedSession,
  signInWithApi,
  signOutWithApi,
  signUpWithApi,
} from '@mobilis/api';
import { mobilisRuntimeConfig } from '@mobilis/config';
import { riderSessionStorage, riderSessionStorageKey } from './session-storage';

function createRiderClient() {
  return createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
    version: mobilisRuntimeConfig.apiVersion,
  });
}

export async function restoreRiderSession() {
  return restorePersistedSession(
    createRiderClient(),
    riderSessionStorage,
    riderSessionStorageKey,
  );
}

export async function signInRiderAccount(payload: {
  email: string;
  password: string;
}) {
  const client = createRiderClient();
  const session = await signInWithApi(client, payload);
  await persistSessionToken(
    riderSessionStorage,
    riderSessionStorageKey,
    session.sessionToken,
  );

  return restorePersistedSession(
    client,
    riderSessionStorage,
    riderSessionStorageKey,
  );
}

export async function signUpRiderAccount(payload: {
  fullName: string;
  email: string;
  password: string;
}) {
  const client = createRiderClient();
  const session = await signUpWithApi(client, {
    ...payload,
    role: 'RIDER',
  });
  await persistSessionToken(
    riderSessionStorage,
    riderSessionStorageKey,
    session.sessionToken,
  );

  return restorePersistedSession(
    client,
    riderSessionStorage,
    riderSessionStorageKey,
  );
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
