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
import { flushRiderMobileErrorReports } from './mobile-error-reporting';
import { riderSessionStorage, riderSessionStorageKey } from './session-storage';

// L'API Render se met en veille apres inactivite et peut
// prendre jusqu'a ~50s a se reveiller (cold start) — le timeout doit tolerer
// ca, sans quoi une connexion reseau parfaite est faussement signalee comme lente.
const riderFieldRequestTimeoutMs = 60_000;
const riderAuthRequestTimeoutMs = 75_000;

export function createRiderPublicClient() {
  return createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
    version: orbiRuntimeConfig.apiVersion,
    requestTimeoutMs: riderFieldRequestTimeoutMs,
  });
}

function createRiderAuthClient() {
  return createOrbiApiClient(resolveOrbiApiBaseUrlForRuntime(), {
    version: orbiRuntimeConfig.apiVersion,
    requestTimeoutMs: riderAuthRequestTimeoutMs,
  });
}

export async function restoreRiderSession() {
  if (isRiderVisualQaSessionEnabled()) {
    return buildVisualQaRiderContext();
  }

  const context = await restorePersistedSession(
    createRiderPublicClient(),
    riderSessionStorage,
    riderSessionStorageKey,
  );
  assertUsableRiderContext(context);
  safelyFlushRiderMobileErrorReports(context);

  return context;
}

export async function signInRiderAccount(payload: {
  email: string;
  password: string;
}) {
  const client = createRiderAuthClient();
  const session = await signInWithApi(client, {
    ...payload,
    expectedRole: 'RIDER',
  });
  await persistSessionToken(
    riderSessionStorage,
    riderSessionStorageKey,
    session.sessionToken,
    session.refreshToken,
  );

  const context = buildFastRiderAuthContext(client, session);
  assertUsableRiderContext(context);
  safelyFlushRiderMobileErrorReports(context);

  return context;
}

export async function signUpRiderAccount(payload: {
  fullName: string;
  email: string;
  password: string;
}) {
  const client = createRiderAuthClient();
  const session = await signUpWithApi(client, {
    ...payload,
    role: 'RIDER',
  });
  await persistSessionToken(
    riderSessionStorage,
    riderSessionStorageKey,
    session.sessionToken,
    session.refreshToken,
  );

  const context = buildFastRiderAuthContext(client, session);
  assertUsableRiderContext(context);
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
  if (isRiderVisualQaSessionEnabled()) {
    return true;
  }

  const token = await riderSessionStorage.getItem(riderSessionStorageKey);
  return Boolean(token);
}

export async function clearRiderPersistedSession() {
  await clearPersistedSession(riderSessionStorage, riderSessionStorageKey);
}

function safelyFlushRiderMobileErrorReports(context: AuthenticatedApiContext) {
  void flushRiderMobileErrorReports(context.authClient).catch(() => undefined);
}

function buildFastRiderAuthContext(
  client: ReturnType<typeof createRiderPublicClient>,
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
        riderProfile: {
          id: session.user.id,
          preferredTier: null,
        },
        driverProfile: null,
      },
      session: session.session,
    },
  };
}

function isRiderVisualQaSessionEnabled() {
  return process.env.EXPO_PUBLIC_ORBI_VISUAL_QA === 'true';
}

function buildVisualQaRiderContext(): AuthenticatedApiContext {
  const client = createRiderPublicClient();
  const session: AuthSessionResponse = {
    message: 'Visual QA rider session ready.',
    sessionToken: 'visual-qa-rider-session',
    user: {
      id: 'visual-qa-rider',
      email: 'rider@orbi.app',
      fullName: 'Awa Ouedraogo',
      role: 'RIDER',
    },
    session: {
      id: 'visual-qa-rider-session-id',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  };

  return buildFastRiderAuthContext(client, session);
}

function assertUsableRiderContext(context: AuthenticatedApiContext) {
  if (context.me.user.role !== 'RIDER' || !context.me.user.riderProfile?.id) {
    void clearRiderPersistedSession();
    throw new Error(
      "Session passager incomplete. Le compte n'a pas pu etre prepare correctement.",
    );
  }
}
