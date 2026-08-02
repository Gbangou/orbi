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
import type { AuthSessionResponse, AuthenticatedApiContext } from '@orbi/api';
import { flushDriverMobileErrorReports } from './mobile-error-reporting';
import { driverSessionStorage, driverSessionStorageKey } from './session-storage';

// L'API Render se met en veille apres inactivite et peut
// prendre jusqu'a ~50s a se reveiller (cold start) — le timeout doit tolerer
// ca, sans quoi une connexion reseau parfaite est faussement signalee comme lente.
const driverFieldRequestTimeoutMs = 60_000;
const driverAuthRequestTimeoutMs = 75_000;

export function createDriverPublicClient() {
  return createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
    version: orbiRuntimeConfig.apiVersion,
    requestTimeoutMs: driverFieldRequestTimeoutMs,
  });
}

function createDriverAuthClient() {
  return createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
    version: orbiRuntimeConfig.apiVersion,
    requestTimeoutMs: driverAuthRequestTimeoutMs,
  });
}

export async function restoreDriverSession() {
  if (isDriverVisualQaSessionEnabled()) {
    return buildVisualQaDriverContext();
  }

  const context = await restorePersistedSession(
    createDriverPublicClient(),
    driverSessionStorage,
    driverSessionStorageKey,
  );
  assertUsableDriverContext(context);
  safelyFlushDriverMobileErrorReports(context);

  return context;
}

export async function signInDriverAccount(payload: {
  email: string;
  password: string;
}) {
  const client = createDriverAuthClient();
  const session = await signInWithApi(client, {
    ...payload,
    expectedRole: 'DRIVER',
  });
  await persistSessionToken(
    driverSessionStorage,
    driverSessionStorageKey,
    session.sessionToken,
  );

  const context = buildFastDriverAuthContext(client, session);
  assertUsableDriverContext(context);
  safelyFlushDriverMobileErrorReports(context);

  return context;
}

export async function signUpDriverAccount(payload: {
  fullName: string;
  email: string;
  password: string;
}) {
  const client = createDriverAuthClient();
  const session = await signUpWithApi(client, {
    ...payload,
    role: 'DRIVER',
  });
  await persistSessionToken(
    driverSessionStorage,
    driverSessionStorageKey,
    session.sessionToken,
  );

  const context = buildFastDriverAuthContext(client, session);
  assertUsableDriverContext(context);
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
  if (isDriverVisualQaSessionEnabled()) {
    return true;
  }

  const token = await driverSessionStorage.getItem(driverSessionStorageKey);
  return Boolean(token);
}

export async function clearDriverPersistedSession() {
  await clearPersistedSession(driverSessionStorage, driverSessionStorageKey);
}

function safelyFlushDriverMobileErrorReports(context: AuthenticatedApiContext) {
  void flushDriverMobileErrorReports(context.authClient).catch(() => undefined);
}

function buildFastDriverAuthContext(
  client: ReturnType<typeof createDriverPublicClient>,
  session: AuthSessionResponse,
): AuthenticatedApiContext {
  const authClient = client.withAuthToken(session.sessionToken);

  return {
    session,
    authClient,
    me: {
      user: {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.fullName,
        phoneNumber: null,
        role: session.user.role,
        riderProfile: null,
        driverProfile: {
          id: session.user.id,
          status: 'OFFLINE',
        },
      },
      session: session.session,
    },
  };
}

function isDriverVisualQaSessionEnabled() {
  return process.env.EXPO_PUBLIC_ORBI_VISUAL_QA === 'true';
}

function buildVisualQaDriverContext(): AuthenticatedApiContext {
  const client = createDriverPublicClient();
  const session: AuthSessionResponse = {
    message: 'Visual QA driver session ready.',
    sessionToken: 'visual-qa-driver-session',
    user: {
      id: 'visual-qa-driver',
      email: 'driver@orbi.app',
      fullName: 'Issa Kaboré',
      role: 'DRIVER',
    },
    session: {
      id: 'visual-qa-driver-session-id',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  };

  return buildFastDriverAuthContext(client, session);
}

function assertUsableDriverContext(context: AuthenticatedApiContext) {
  if (context.me.user.role !== 'DRIVER' || !context.me.user.driverProfile?.id) {
    void clearDriverPersistedSession();
    throw new Error(
      "Session chauffeur incomplete. Le compte n'a pas pu etre prepare correctement.",
    );
  }
}
