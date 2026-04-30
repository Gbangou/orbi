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
import { driverSessionStorage, driverSessionStorageKey } from './session-storage';

function createDriverClient() {
  return createMobilisApiClient(mobilisRuntimeConfig.apiBaseUrl, {
    version: mobilisRuntimeConfig.apiVersion,
  });
}

export async function restoreDriverSession() {
  return restorePersistedSession(
    createDriverClient(),
    driverSessionStorage,
    driverSessionStorageKey,
  );
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

  return restorePersistedSession(
    client,
    driverSessionStorage,
    driverSessionStorageKey,
  );
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

  return restorePersistedSession(
    client,
    driverSessionStorage,
    driverSessionStorageKey,
  );
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
