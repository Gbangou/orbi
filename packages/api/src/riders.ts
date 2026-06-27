// ── Rider types and API functions ─────────────────────────────────────────────

import type { ApiServiceTier } from "@orbi/domain";

import type { OrbiApiClient } from "./client.js";
import { apiRoutes } from "./routes.js";

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
