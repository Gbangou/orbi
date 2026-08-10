// ── Driver types and API functions ────────────────────────────────────────────

import type { ApiServiceTier, DriverOffer } from "@orbi/domain";

import type { OrbiApiClient } from "./client";
import { apiRoutes } from "./routes";
import type { DriverDocumentUploadLinksResponse } from "./admin";

// ── Driver response types ─────────────────────────────────────────────────────

export type DriverFatigueStatus = {
  state: "clear" | "warning" | "blocked";
  completedTrips: number;
  drivingMinutes: number;
  windowHours: number;
  maxCompletedTrips: number;
  maxDrivingMinutes: number;
  restMinutes: number;
  restUntil: string | null;
  reason: string;
};

export type DriverProfileResponse = {
  profile: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
    status: string;
    verificationStatus: string;
    serviceRadiusKm: number | null;
    currentLatitude?: number | null;
    currentLongitude?: number | null;
    averageRating: number | null;
    completedTripsCount: number;
    fatigue: DriverFatigueStatus;
    onboarding: {
      verificationStatus: string;
      reviewStatus:
        | "SUBMITTED"
        | "UNDER_REVIEW"
        | "APPROVED"
        | "REJECTED"
        | "CHANGES_REQUESTED";
      completedItems: number;
      totalItems: number;
      readinessPercent: number;
      serviceRadiusKm: number | null;
      city: string | null;
      submittedAt: string | null;
      latestReviewAt: string | null;
      latestDecisionReason: string | null;
      reviewActorName: string | null;
      notes: string;
      checklist: Array<{
        id: string;
        label: string;
        completed: boolean;
      }>;
      documents: Array<{
        type:
          | "IDENTITY_DOCUMENT"
          | "DRIVER_LICENSE"
          | "VEHICLE_REGISTRATION"
          | "INSURANCE_PROOF"
          | "SELFIE_VERIFICATION";
        status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        fileName: string | null;
        uploadedAt: string | null;
        expiresAt: string | null;
        reviewedAt: string | null;
        rejectionReason: string | null;
      }>;
      reviewTimeline: Array<{
        id: string;
        status:
          | "SUBMITTED"
          | "UNDER_REVIEW"
          | "APPROVED"
          | "REJECTED"
          | "CHANGES_REQUESTED";
        actorName: string;
        decisionReason: string | null;
        createdAt: string;
      }>;
    };
    vehicles: Array<{
      id: string;
      plateNumber: string;
      make: string;
      model: string;
      color: string;
      type: "MOTORCYCLE" | "CAR";
      tier: ApiServiceTier;
      isActive: boolean;
    }>;
    /** Dispatch performance signal — acceptance rate & score over recent window */
    dispatchSignal?: {
      acceptanceRate: number | null;
      score: number;
      freshness: string;
    };
  };
};

export type DriverAvailabilityResponse = {
  availability: {
    driverId: string;
    status: "ONLINE" | "OFFLINE";
    fatigue: DriverFatigueStatus;
    reservedOfferCount?: number;
  };
};

export type DriverDispatchReadinessResponse = {
  readiness: {
    driverId: string;
    canReceiveOffers: boolean;
    status: string;
    verificationStatus: string;
    activeVehicleCount: number;
    supportedVehicleTypes: Array<"MOTORCYCLE" | "CAR">;
    supportedServiceTiers: ApiServiceTier[];
    hasGpsPosition: boolean;
    serviceRadiusKm: number | null;
    activeTripId: string | null;
    compatibleOpenRequestCount: number;
    nearOpenRequestCount: number;
    reservedOfferCount: number;
    heldByOtherDriverCount: number;
    blockers: Array<{
      code:
        | "OFFLINE"
        | "SUSPENDED"
        | "UNAPPROVED"
        | "NO_ACTIVE_VEHICLE"
        | "ACTIVE_TRIP"
        | "GPS_MISSING"
        | "FATIGUE_BLOCKED";
      message: string;
    }>;
    checkedAt: string;
  };
};

export type DriverPresenceResponse = {
  presence: {
    driverId: string;
    status: string;
    latitude: number | null;
    longitude: number | null;
    ignored?: boolean;
    reason?: "STALE_POSITION";
  };
};

export type DriverOnboardingResponse = {
  onboarding: DriverProfileResponse["profile"]["onboarding"];
};

export type DriverEarningsResponse = {
  summary: {
    currency: string;
    today: number;
    week: number;
    month: number;
    completedTrips: number;
    averagePayout: number;
  };
  balances?: {
    currency: string;
    gross: number;
    commission: number;
    net: number;
    available: number;
    pending: number;
    paid: number;
    adjustments: number;
    refunds: number;
  };
  settlement: {
    currency: string;
    source: "COMPLETED_TRIPS";
    payoutRateBps: number;
    payoutRate: number;
    payoutRateMin?: number;
    payoutRateMax?: number;
    recentTripCount: number;
    recentGrossFare: number;
    recentNetPayout: number;
    recentPlatformFee: number;
    availablePayout?: number;
    pendingPayout?: number;
    paidPayout?: number;
    adjustmentTotal?: number;
    refundTotal?: number;
    state: "RECONCILED" | "REVIEW_REQUIRED";
    anomalies: string[];
    calculatedAt: string;
  };
  adjustments?: {
    currency: string;
    cancellationCompensationToday: number;
    cancellationCompensationWeek: number;
    cancellationCompensationMonth: number;
    recent: Array<{
      id: string;
      type: "CANCELLATION_COMPENSATION";
      amount: number;
      reference: string | null;
      description: string | null;
      createdAt: string;
    }>;
  };
  recentTrips: Array<{
    id: string;
    route: string;
    payout: number;
    grossFare: number;
    platformFee: number;
    available: number;
    pending: number;
    paid: number;
    adjustment: number;
    refund: number;
    commissionRate?: number;
    payoutRate?: number;
    status: string;
    completedAt: string | null;
  }>;
};

export type DriverOfferDeclineResponse = {
  offer: {
    rideRequestId: string;
    status: "DECLINED";
  };
};

export interface NearbyDriverMarker {
  id: string;
  latitude: number;
  longitude: number;
  vehicleType: string | null;
  status: string;
}

export interface NearbyDriversResponse {
  drivers: NearbyDriverMarker[];
  total: number;
}

// ── Driver API functions ──────────────────────────────────────────────────────

export async function fetchNearbyDrivers(
  client: OrbiApiClient,
  params: { lat: number; lng: number; radiusKm?: number },
): Promise<NearbyDriversResponse> {
  const radius = params.radiusKm ?? 5;
  return client.request<NearbyDriversResponse>(
    `${apiRoutes.drivers.nearby}?lat=${params.lat}&lng=${params.lng}&radius=${radius}`,
  );
}

export async function fetchDriverPreviewOffers(client: OrbiApiClient) {
  return client.request<DriverOffer[]>(apiRoutes.drivers.previewOffers);
}

export async function fetchDriverProfile(client: OrbiApiClient) {
  return client.request<DriverProfileResponse>(apiRoutes.drivers.me);
}

export async function fetchDriverOnboarding(client: OrbiApiClient) {
  return client.request<DriverOnboardingResponse>(apiRoutes.drivers.onboarding);
}

export async function upsertDriverOnboarding(
  client: OrbiApiClient,
  payload: {
    phoneNumber?: string;
    licenseNumber: string;
    city:
      | "OUAGADOUGOU"
      | "BOBO_DIOULASSO"
      | "KOUDOUGOU"
      | "BANFORA"
      | "OUAHIGOUYA";
    serviceRadiusKm: number;
    documents: {
      identityDocumentProvided: boolean;
      driverLicenseProvided: boolean;
      vehicleRegistrationProvided: boolean;
      insuranceProofProvided: boolean;
      selfieMatchProvided: boolean;
    };
    documentArtifacts?: Array<{
      type:
        | "IDENTITY_DOCUMENT"
        | "DRIVER_LICENSE"
        | "VEHICLE_REGISTRATION"
        | "INSURANCE_PROOF"
        | "SELFIE_VERIFICATION";
      fileName: string;
      storageKey: string;
      mimeType?: string;
      expiresAt?: string;
      sizeBytes?: number;
      sha256?: string;
      uploadSource?: string;
    }>;
    vehicles: Array<{
      plateNumber: string;
      make: string;
      model: string;
      color: string;
      year?: number;
      type: "MOTORCYCLE" | "CAR";
      tier:
        | "MOTO_STANDARD"
        | "CAR_STANDARD"
        | "CAR_COMFORT"
        | "CAR_XL";
      seats?: number;
    }>;
  },
) {
  return client.request<DriverOnboardingResponse>(
    apiRoutes.drivers.onboarding,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function requestDriverDocumentUploadLinks(
  client: OrbiApiClient,
  payload: {
    documents: Array<{
      type:
        | "IDENTITY_DOCUMENT"
        | "DRIVER_LICENSE"
        | "VEHICLE_REGISTRATION"
        | "INSURANCE_PROOF"
        | "SELFIE_VERIFICATION";
      fileName: string;
      mimeType?: string;
      expiresAt?: string;
    }>;
  },
) {
  return client.request<DriverDocumentUploadLinksResponse>(
    apiRoutes.drivers.onboardingDocumentUploadLinks,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function fetchDriverEarnings(client: OrbiApiClient) {
  return client.request<DriverEarningsResponse>(apiRoutes.drivers.earnings);
}

export async function fetchDriverOffers(client: OrbiApiClient) {
  return client.request<DriverOffer[]>(apiRoutes.drivers.offers);
}

export async function fetchDriverDispatchReadiness(client: OrbiApiClient) {
  return client.request<DriverDispatchReadinessResponse>(
    apiRoutes.drivers.dispatchReadiness,
  );
}

export async function declineDriverOfferWithApi(
  client: OrbiApiClient,
  rideRequestId: string,
) {
  return client.request<DriverOfferDeclineResponse>(
    `${apiRoutes.drivers.declineOffer}/${rideRequestId}/decline`,
    {
      method: "POST",
    },
  );
}

export async function updateDriverAvailabilityWithApi(
  client: OrbiApiClient,
  status: "ONLINE" | "OFFLINE",
) {
  return client.request<DriverAvailabilityResponse>(
    apiRoutes.drivers.availability,
    {
      method: "PATCH",
      body: {
        status,
      },
    },
  );
}

export async function updateDriverPresenceWithApi(
  client: OrbiApiClient,
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    observedAt?: string;
  },
) {
  return client.request<DriverPresenceResponse>(apiRoutes.drivers.presence, {
    method: "PATCH",
    body: payload,
  });
}
