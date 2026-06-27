// ── Auth types and API functions ──────────────────────────────────────────────

import type { ApiServiceTier, ApiUserRole } from "@orbi/domain";

import type { OrbiApiClient } from "./client";
import { apiRoutes } from "./routes";

export type SignUpPayload = {
  fullName: string;
  email: string;
  password: string;
  role: ApiUserRole;
};

export type SignInPayload = {
  email: string;
  password: string;
};

export type SignUpApiPayload = {
  fullName: string;
  email: string;
  password: string;
  role: "RIDER" | "DRIVER";
};

export type AuthSessionResponse = {
  message: string;
  sessionToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: ApiUserRole;
  };
  session: {
    id: string;
    expiresAt: string;
  };
};

export type CurrentUserResponse = {
  user: {
    id: string;
    email: string;
    fullName: string;
    phoneNumber: string | null;
    role: ApiUserRole;
    riderProfile: {
      id: string;
      preferredTier?: ApiServiceTier | null;
    } | null;
    driverProfile: {
      id: string;
      status?: string | null;
    } | null;
  };
  session: {
    id: string;
    expiresAt: string;
  };
};

export type AuthenticatedApiContext = {
  session: AuthSessionResponse;
  authClient: OrbiApiClient;
  me: CurrentUserResponse;
};

export type SessionStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type SignOutResponse = {
  message: string;
  revokedSessionId: string;
};

export type TicketCategory =
  | "payment"
  | "trip"
  | "account"
  | "driver"
  | "safety"
  | "other";

export type SupportTicketStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";

export interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: number;
  adminNote: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateSupportTicketPayload {
  subject: string;
  description: string;
  category?: TicketCategory;
}

export interface CreateSupportTicketResponse {
  ticket: SupportTicket;
}

export interface MySupportTicketsResponse {
  tickets: SupportTicket[];
}

export type PromoValidationResponse = {
  valid: true;
  code: string;
  discountBps: number;
  discountPercent: number;
  description: string | null;
  firstTripOnly: boolean;
  validTo: string;
};

// ── Auth API functions ────────────────────────────────────────────────────────

export async function signInWithApi(
  client: OrbiApiClient,
  payload: SignInPayload,
) {
  return client.request<AuthSessionResponse>(apiRoutes.auth.signIn, {
    method: "POST",
    body: payload,
  });
}

export async function signUpWithApi(
  client: OrbiApiClient,
  payload: SignUpApiPayload,
) {
  return client.request<AuthSessionResponse>(apiRoutes.auth.signUp, {
    method: "POST",
    body: payload,
  });
}

export async function fetchCurrentUser(client: OrbiApiClient) {
  return client.request<CurrentUserResponse>(apiRoutes.auth.me);
}

export async function authenticateAndFetchCurrentUser(
  client: OrbiApiClient,
  payload: SignInPayload,
): Promise<AuthenticatedApiContext> {
  const session = await signInWithApi(client, payload);
  const authClient = client.withAuthToken(session.sessionToken);
  const me = await fetchCurrentUser(authClient);

  return {
    session,
    authClient,
    me,
  };
}

export async function restoreOrAuthenticateSession(
  client: OrbiApiClient,
  storage: SessionStorageAdapter,
  storageKey: string,
  credentials: SignInPayload,
): Promise<AuthenticatedApiContext> {
  const existingToken = await storage.getItem(storageKey);

  if (existingToken) {
    try {
      const authClient = client.withAuthToken(existingToken);
      const me = await fetchCurrentUser(authClient);

      return {
        session: {
          message: "Restored existing session.",
          sessionToken: existingToken,
          user: {
            id: me.user.id,
            email: me.user.email,
            fullName: me.user.fullName,
            role: me.user.role,
          },
          session: {
            id: me.session.id,
            expiresAt: me.session.expiresAt,
          },
        },
        authClient,
        me,
      };
    } catch {
      await storage.removeItem(storageKey);
    }
  }

  const context = await authenticateAndFetchCurrentUser(client, credentials);
  await storage.setItem(storageKey, context.session.sessionToken);

  return context;
}

export async function restorePersistedSession(
  client: OrbiApiClient,
  storage: SessionStorageAdapter,
  storageKey: string,
): Promise<AuthenticatedApiContext> {
  const existingToken = await storage.getItem(storageKey);

  if (!existingToken) {
    throw new Error("Aucune session enregistree sur cet appareil.");
  }

  try {
    const authClient = client.withAuthToken(existingToken);
    const me = await fetchCurrentUser(authClient);

    return {
      session: {
        message: "Restored existing session.",
        sessionToken: existingToken,
        user: {
          id: me.user.id,
          email: me.user.email,
          fullName: me.user.fullName,
          role: me.user.role,
        },
        session: {
          id: me.session.id,
          expiresAt: me.session.expiresAt,
        },
      },
      authClient,
      me,
    };
  } catch (error) {
    await storage.removeItem(storageKey);
    throw error;
  }
}

export async function persistSessionToken(
  storage: SessionStorageAdapter,
  storageKey: string,
  sessionToken: string,
) {
  await storage.setItem(storageKey, sessionToken);
}

export async function clearPersistedSession(
  storage: SessionStorageAdapter,
  storageKey: string,
) {
  await storage.removeItem(storageKey);
}

export async function signOutWithApi(
  client: OrbiApiClient,
  payload?: {
    sessionId?: string;
  },
) {
  return client.request<SignOutResponse>(apiRoutes.auth.signOut, {
    method: "POST",
    body: payload,
  });
}

export async function registerPushTokenWithApi(
  client: OrbiApiClient,
  token: string,
): Promise<void> {
  await client.requestText(apiRoutes.users.pushToken, {
    method: "POST",
    body: { token },
  });
}

export async function createSupportTicketWithApi(
  client: OrbiApiClient,
  payload: CreateSupportTicketPayload,
): Promise<CreateSupportTicketResponse> {
  return client.request<CreateSupportTicketResponse>(
    apiRoutes.auth.supportTickets,
    { method: "POST", body: payload },
  );
}

export async function getMySupportTicketsWithApi(
  client: OrbiApiClient,
): Promise<MySupportTicketsResponse> {
  return client.request<MySupportTicketsResponse>(
    apiRoutes.auth.supportTickets,
  );
}

export async function validatePromoCodeWithApi(
  client: OrbiApiClient,
  code: string,
): Promise<PromoValidationResponse> {
  return client.request<PromoValidationResponse>("/auth/validate-promo-code", {
    method: "POST",
    body: { code },
  });
}
