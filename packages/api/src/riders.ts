// ── Rider types and API functions ─────────────────────────────────────────────

import type { ApiServiceTier } from "@orbi/domain";

import type { OrbiApiClient } from "./client";
import { apiRoutes } from "./routes";

// ── Rider response types ──────────────────────────────────────────────────────

export type RiderProfileResponse = {
  profile: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
    preferredTier: ApiServiceTier | null;
    emergencyPhone: string | null;
    trustedContact: {
      phoneNumber: string | null;
      shareMode: "DISABLED" | "MANUAL" | "NIGHT" | "ALL_TRIPS";
      status: "MISSING" | "READY";
      safetyNote: string;
    };
    trustedContacts: Array<{
      id: string | null;
      label: string;
      phoneNumber: string;
      priority: number;
      isActive: boolean;
    }>;
    savedPlaces: Array<{
      id: string;
      label: string;
      address: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    stats: {
      totalRideRequests: number;
      totalTrips: number;
      completedTrips: number;
      savedPlaces: number;
    };
  };
};

export type SavedPlaceMutationResponse = {
  savedPlace: RiderProfileResponse["profile"]["savedPlaces"][number];
};

export type TrustedContactMutationResponse = {
  trustedContact: {
    riderProfileId: string;
    phoneNumber: string | null;
    shareMode: "DISABLED" | "MANUAL" | "NIGHT" | "ALL_TRIPS";
    status: "MISSING" | "READY";
    safetyNote: string;
  };
  trustedContacts: RiderProfileResponse["profile"]["trustedContacts"];
};

export type TrustedContactRosterMutationResponse = {
  trustedContacts: RiderProfileResponse["profile"]["trustedContacts"];
};

export type TrustedContactDeleteResponse = TrustedContactRosterMutationResponse & {
  deleted: boolean;
  trustedContactId: string;
};

export type SavedPlaceDeleteResponse = {
  deleted: boolean;
  savedPlaceId: string;
};

// ── Rider API functions ───────────────────────────────────────────────────────

export async function fetchRiderProfile(client: OrbiApiClient) {
  return client.request<RiderProfileResponse>(apiRoutes.riders.me);
}

export async function createSavedPlaceWithApi(
  client: OrbiApiClient,
  payload: {
    label: string;
    address: string;
    latitude: number;
    longitude: number;
  },
) {
  return client.request<SavedPlaceMutationResponse>(
    apiRoutes.riders.savedPlaces,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function updateTrustedContactWithApi(
  client: OrbiApiClient,
  payload: {
    phoneNumber?: string;
    shareMode?: "MANUAL" | "NIGHT" | "ALL_TRIPS";
    notes?: string;
  },
) {
  return client.request<TrustedContactMutationResponse>(
    apiRoutes.riders.trustedContact,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function createTrustedContactWithApi(
  client: OrbiApiClient,
  payload: {
    label?: string;
    phoneNumber: string;
    priority?: number;
  },
) {
  return client.request<TrustedContactRosterMutationResponse>(
    apiRoutes.riders.trustedContacts,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function updateTrustedContactEntryWithApi(
  client: OrbiApiClient,
  trustedContactId: string,
  payload: {
    label?: string;
    phoneNumber?: string;
    priority?: number;
    isActive?: boolean;
  },
) {
  return client.request<TrustedContactRosterMutationResponse>(
    `${apiRoutes.riders.trustedContacts}/${trustedContactId}`,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function deleteTrustedContactWithApi(
  client: OrbiApiClient,
  trustedContactId: string,
) {
  return client.request<TrustedContactDeleteResponse>(
    `${apiRoutes.riders.trustedContacts}/${trustedContactId}`,
    {
      method: "DELETE",
    },
  );
}

export async function updateSavedPlaceWithApi(
  client: OrbiApiClient,
  savedPlaceId: string,
  payload: {
    label?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  },
) {
  return client.request<SavedPlaceMutationResponse>(
    `${apiRoutes.riders.savedPlaces}/${savedPlaceId}`,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function deleteSavedPlaceWithApi(
  client: OrbiApiClient,
  savedPlaceId: string,
) {
  return client.request<SavedPlaceDeleteResponse>(
    `${apiRoutes.riders.savedPlaces}/${savedPlaceId}`,
    {
      method: "DELETE",
    },
  );
}

// ── Wallet top-up ─────────────────────────────────────────────────────────────

export type WalletBalanceResponse = {
  balance: number;
  currency: string;
  isLocked: boolean;
  lastUpdatedAt: string | null;
};

export type WalletTopUpResponse = {
  topUpId: string;
  depositId: string;
  amount: number;
  currency: string;
  status: "PENDING" | "FAILED";
  awaitingPhoneConfirmation: boolean;
  message: string;
};

export type WalletTopUpHistoryItem = {
  id: string;
  amount: number;
  currency: string;
  status: "INITIATED" | "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  network: string | null;
  createdAt: string;
  failureReason: string | null;
};

export async function fetchWalletBalanceWithApi(client: OrbiApiClient) {
  return client.request<WalletBalanceResponse>("/riders/me/wallet");
}

export async function initiateWalletTopUpWithApi(
  client: OrbiApiClient,
  payload: {
    amountXof: number;
    mobileMoneyNetwork: string;
    customerPhoneNumber: string;
  },
) {
  return client.request<WalletTopUpResponse>("/riders/me/wallet/topup", {
    method: "POST",
    body: payload,
  });
}

export async function fetchWalletTopUpHistoryWithApi(client: OrbiApiClient) {
  return client.request<WalletTopUpHistoryItem[]>(
    "/riders/me/wallet/topup-history",
  );
}
