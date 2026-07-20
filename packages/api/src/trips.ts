// ── Trip types and API functions ──────────────────────────────────────────────

import type {
  ApiDistrictProfile,
  ApiDemandLevel,
  ApiMarketZone,
  ApiPaymentMethod,
  ApiPricingCity,
  ApiServiceTier,
  ApiUserRole,
  ApiVehicleType,
  PaymentMethod,
  PricingEstimate,
  RideOption,
  ServiceTier,
  VehicleCategory,
} from "@orbi/domain";

import type { OrbiApiClient } from "./client";
import { apiRoutes } from "./routes";

// ── Shared payload/response types ─────────────────────────────────────────────

export type TripRouteMonitoringAlertType =
  | "LONG_STOP"
  | "ROUTE_DEVIATION"
  | "NO_PROGRESS"
  | "GPS_POSITION_ANOMALY"
  | "PICKUP_MISMATCH";

export type MyTripsResponse = {
  role: ApiUserRole;
  stats: {
    activeTrips: number;
    completedTrips: number;
    cancelledTrips: number;
    totalAmount: number;
    currency: string;
  };
  pendingRequests: Array<{
    id: string;
    pickupAddress: string;
    destinationAddress: string;
    estimatedFare: number;
    status: string;
    createdAt: string;
  }>;
  recentTrips: Array<{
    id: string;
    pickupAddress: string;
    destinationAddress: string;
    status: string;
    amount: number;
    currency: string;
    counterpartyName: string | null;
    vehicleLabel: string | null;
    pickupCode?: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
};

export type TripLifecycleResponse = {
  trip: {
    id: string;
    rideRequestId: string;
    status: string;
    pickupAddress?: string;
    destinationAddress?: string;
    riderName?: string;
    vehicleLabel?: string;
    pickupCode?: string | null;
    actualFare: number;
    currency: string;
    createdAt?: string;
    startedAt?: string | null;
    completedAt?: string | null;
  };
};

export type TripDetailResponse = {
  trip: {
    id: string;
    rideRequestId: string;
    status: string;
    pickupAddress: string;
    destinationAddress: string;
    riderName: string;
    driverName: string;
    vehicleLabel: string;
    driverVerification: {
      verificationStatus: string;
      phoneVerified: boolean;
      averageRating: number | null;
      completedTripsCount: number;
      profilePhotoUrl?: string | null;
      vehicle: {
        plateNumber: string;
        color: string;
        make: string;
        model: string;
        year?: number | null;
        seats?: number | null;
        type?: ApiVehicleType | string;
        tier?: ApiServiceTier | string;
      };
    };
    routeMonitoring: {
      state: "unknown" | "clear" | "warning" | "critical";
      alertCount: number;
      lastAlertType: TripRouteMonitoringAlertType | null;
      lastAlertAt: string | null;
      lastPositionAt: string | null;
      latestPosition: {
        latitude: number;
        longitude: number;
        accuracyMeters: number | null;
        speedKph: number | null;
        distanceToPickupKm: number | null;
        distanceToDestinationKm: number | null;
        observedAt: string;
        sourceRole: string | null;
      } | null;
    };
    pickupCode?: string | null;
    driverPhoneNumber: string | null;
    riderPhoneNumber: string | null;
    actualFare: number;
    currency: string;
    pickupLatitude: number | null;
    pickupLongitude: number | null;
    destinationLatitude: number | null;
    destinationLongitude: number | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    timeline: Array<{
      id: string;
      eventType: string;
      label: string;
      createdAt: string;
    }>;
    promoCode?: { code: string; discountBps: number } | null;
  };
};

export type TripShareLinkResponse = {
  share: {
    tripId: string;
    token: string;
    path: string;
    expiresAt: string;
    ttlMinutes: number;
  };
};

export type TripRoutePositionResponse = {
  routeMonitoring: {
    tripId: string;
    state: "clear" | "alert";
    checkedAt: string;
    latestPosition: {
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      speedKph: number | null;
      distanceToPickupKm: number | null;
      distanceToDestinationKm: number | null;
      observedAt: string;
      sourceRole: string | null;
    } | null;
    alerts: Array<{
      alertType: TripRouteMonitoringAlertType;
      severity: "warning" | "critical";
      priority: 2 | 3;
      message: string;
      measuredValue: number;
      threshold: number;
    }>;
    ticketIds: string[];
  };
};

export type SharedTripResponse = {
  sharedTrip: {
    tripId: string;
    status: string;
    pickupAddress: string;
    destinationAddress: string;
    riderName: string;
    driverName: string;
    vehicleLabel: string;
    lastEvent: {
      label: string;
      createdAt: string;
    } | null;
    expiresAt: string | null;
    safetyNote: string;
  };
};

export type TripIncidentResponse = {
  incident: {
    tripId: string;
    ticketId: string;
    priority: number;
    incidentType: string;
    reportedByRole: string;
    status: string;
    voluntaryEvidence: {
      declared: boolean;
      type: "AUDIO" | "PHOTO" | "VIDEO" | "TEXT_NOTE" | null;
      retentionHours: number | null;
      expiresAt: string | null;
      storagePolicy: string | null;
    };
  };
};

export type TripSafetySosResponse = {
  sos: {
    tripId: string;
    ticketId: string;
    priority: number;
    incidentType: "SOS_TRIGGERED";
    reportedByRole: string;
    status: string;
    localEmergencyNumber: string;
    locationCaptured: boolean;
  };
};

export type TripRatingResponse = {
  rating: {
    id: string;
    tripId: string;
    score: number;
    comment: string | null;
    createdAt: string;
  };
};

export type CreateRideRequestPayload = {
  pickupAddress: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  destinationAddress: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  requestedVehicleType: "MOTORCYCLE" | "CAR";
  requestedServiceTier?:
    | "MOTO_STANDARD"
    | "CAR_STANDARD"
    | "CAR_COMFORT"
    | "CAR_XL";
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  paymentMethod?: "MOBILE_MONEY" | "CASH" | "WALLET";
  pickupAreaType?: "URBAN_CORE" | "URBAN_EDGE" | "SEMI_URBAN";
  city?:
    | "OUAGADOUGOU"
    | "BOBO_DIOULASSO"
    | "KOUDOUGOU"
    | "BANFORA"
    | "OUAHIGOUYA";
  districtProfile?:
    | "CBD"
    | "UNIVERSITY"
    | "GOVERNMENT"
    | "AIRPORT"
    | "RESIDENTIAL_STANDARD"
    | "RESIDENTIAL_PERIPHERAL"
    | "MARKET_DENSE"
    | "INDUSTRIAL"
    | "INTERCITY_GATE";
  notes?: string;
  promoCode?: string;
};

export type RideRequestResponse = {
  id: string;
  status: string;
  pickupAddress: string;
  destinationAddress: string;
  estimatedFare?: number | string | null;
  estimatedDistanceKm?: number | string | null;
  estimatedDurationMinutes?: number | null;
  routeMetricsSource?: "SERVER_COORDINATES" | "CLIENT_ESTIMATE";
  requestedVehicleType: "MOTORCYCLE" | "CAR";
  requestedServiceTier?: string | null;
  paymentMethod?: "MOBILE_MONEY" | "CASH" | "WALLET" | string | null;
  city?: string | null;
  districtProfile?: string | null;
  createdAt?: string;
  pricingContextSummary?: string | null;
  bookingReadinessSummary?: string | null;
  pricingReason?: string | null;
};

export type RideRequestLifecycleResponse = {
  rideRequest: {
    id: string;
    status: string;
    pickupAddress: string;
    destinationAddress: string;
    updatedAt: string;
  };
};

export type RideOptionsPreviewResponse = {
  route: {
    distanceKm: number;
    durationMinutes: number;
  };
  options: RideOption[];
};

export type VoiceLocationIntentResponse = {
  locale: string;
  transcript: string;
  normalizedTranscript: string;
  interpretation: string;
  intentType: "pickup" | "destination" | "unknown";
  confidence: number;
  needsClarification: boolean;
  suggestions: Array<{
    id: string;
    name: string;
    address: string;
    district: string;
    latitude: number;
    longitude: number;
    confidence: number;
  }>;
};

export type PricingEstimateQuery = {
  vehicleType: ApiVehicleType;
  serviceTier?: ApiServiceTier;
  distanceKm: number;
  durationMinutes: number;
  paymentMethod?: ApiPaymentMethod;
  zone?: ApiMarketZone;
  city?: ApiPricingCity;
  districtProfile?: ApiDistrictProfile;
  demandLevel?: ApiDemandLevel;
  trafficLevel?: "FREE_FLOW" | "MODERATE" | "HEAVY" | "GRIDLOCK";
  weatherCondition?: "CLEAR" | "HEAT" | "WIND" | "DUST" | "RAIN" | "STORM";
  roadCondition?: "OPEN" | "SLOW" | "CONGESTED" | "BLOCKED";
  isPeakHour?: boolean;
  activeDriverCount?: number;
  openRequestCount?: number;
  driverOnboardingDays?: number;
  pickupLatitude?: number;
  pickupLongitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
};

export type ScheduledRideStatus =
  | 'PENDING'
  | 'DISPATCHING'
  | 'MATCHED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'EXPIRED';

export type ScheduledRide = {
  id: string;
  pickupAddress: string;
  destinationAddress: string;
  scheduledFor: string;
  vehicleType: string;
  paymentMethod: string;
  city: string;
  status: ScheduledRideStatus;
  estimatedFare: number | null;
  notes: string | null;
  promoCode: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  canCancel: boolean;
  minutesUntilPickup: number;
};

export type CreateScheduledRidePayload = {
  pickupAddress: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  destinationAddress: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  scheduledFor: string;
  vehicleType?: 'MOTORCYCLE' | 'CAR';
  paymentMethod?: 'MOBILE_MONEY' | 'CASH' | 'WALLET';
  city?: string;
  notes?: string;
  promoCode?: string;
};

// ── Mapping helpers ───────────────────────────────────────────────────────────

export function toApiVehicleType(
  category: VehicleCategory,
): CreateRideRequestPayload["requestedVehicleType"] {
  return category === "motorcycle" ? "MOTORCYCLE" : "CAR";
}

export function toApiServiceTier(
  tier: ServiceTier,
): NonNullable<CreateRideRequestPayload["requestedServiceTier"]> {
  return tier.replace(/-/g, "_").toUpperCase() as NonNullable<
    CreateRideRequestPayload["requestedServiceTier"]
  >;
}

export function toApiPaymentMethod(
  method: PaymentMethod,
): NonNullable<CreateRideRequestPayload["paymentMethod"]> {
  return method.replace(/-/g, "_").toUpperCase() as NonNullable<
    CreateRideRequestPayload["paymentMethod"]
  >;
}

// ── Trip API functions ────────────────────────────────────────────────────────

export async function fetchMyTrips(client: OrbiApiClient) {
  return client.request<MyTripsResponse>(apiRoutes.trips.mine);
}

export async function fetchTripDetail(client: OrbiApiClient, tripId: string) {
  return client.request<TripDetailResponse>(
    `${apiRoutes.trips.root}/${tripId}`,
  );
}

export async function createTripShareLinkWithApi(
  client: OrbiApiClient,
  tripId: string,
) {
  return client.request<TripShareLinkResponse>(
    `${apiRoutes.trips.shareLink}/${tripId}/share-link`,
    {
      method: "POST",
    },
  );
}

export async function recordTripRoutePositionWithApi(
  client: OrbiApiClient,
  tripId: string,
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    speedKph?: number;
    distanceToDestinationKm?: number;
  },
) {
  return client.request<TripRoutePositionResponse>(
    `${apiRoutes.trips.root}/${tripId}/route-position`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function fetchSharedTripWithApi(
  client: OrbiApiClient,
  shareToken: string,
) {
  return client.request<SharedTripResponse>(
    `${apiRoutes.trips.shared}/${encodeURIComponent(shareToken)}`,
  );
}

export async function acceptRideRequestWithApi(
  client: OrbiApiClient,
  rideRequestId: string,
) {
  return client.request<TripLifecycleResponse>(
    `${apiRoutes.trips.acceptRideRequest}/${rideRequestId}`,
    {
      method: "POST",
    },
  );
}

export async function updateTripStatusWithApi(
  client: OrbiApiClient,
  tripId: string,
  status: "DRIVER_ARRIVING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  cancellationReason?: string,
) {
  return client.request<TripLifecycleResponse>(
    `${apiRoutes.trips.root ?? "/trips"}/${tripId}/status`,
    {
      method: "PATCH",
      body: {
        status,
        ...(status === "CANCELLED" && cancellationReason
          ? { cancellationReason }
          : {}),
      },
    },
  );
}

export async function verifyPickupCodeWithApi(
  client: OrbiApiClient,
  tripId: string,
  pickupCode: string,
) {
  return client.request<TripLifecycleResponse>(
    `${apiRoutes.trips.verifyPickupCode}/${tripId}/verify-pickup-code`,
    {
      method: "POST",
      body: {
        pickupCode,
      },
    },
  );
}

export async function reportTripIncidentWithApi(
  client: OrbiApiClient,
  tripId: string,
  payload: {
    incidentType: string;
    details?: string;
    priority?: number;
    evidenceConsent?: boolean;
    evidenceType?: "AUDIO" | "PHOTO" | "VIDEO" | "TEXT_NOTE";
    evidenceRetentionHours?: number;
  },
) {
  return client.request<TripIncidentResponse>(
    `${apiRoutes.trips.reportIncident}/${tripId}/report-incident`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function triggerTripSafetySosWithApi(
  client: OrbiApiClient,
  tripId: string,
  payload: {
    details?: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
  } = {},
) {
  return client.request<TripSafetySosResponse>(
    `${apiRoutes.trips.safetySos}/${tripId}/sos`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function rateTripWithApi(
  client: OrbiApiClient,
  tripId: string,
  payload: { score: number; comment?: string },
) {
  return client.request<TripRatingResponse>(
    `${apiRoutes.trips.rate}/${tripId}/rate`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function fetchRideOptionsPreview(
  client: OrbiApiClient,
  query: PricingEstimateQuery,
) {
  return client.request<RideOptionsPreviewResponse>(
    apiRoutes.pricing.rideOptions,
    {
      query,
    },
  );
}

export async function fetchPricingEstimate(
  client: OrbiApiClient,
  query: PricingEstimateQuery,
) {
  return client.request<PricingEstimate>(apiRoutes.pricing.estimate, {
    query,
  });
}

export async function createRideRequestWithApi(
  client: OrbiApiClient,
  payload: CreateRideRequestPayload,
  options: { idempotencyKey?: string } = {},
) {
  return client.request<RideRequestResponse>(apiRoutes.rideRequests.root, {
    method: "POST",
    body: payload,
    headers: options.idempotencyKey
      ? { "Idempotency-Key": options.idempotencyKey }
      : undefined,
  });
}

export async function cancelRideRequestWithApi(
  client: OrbiApiClient,
  rideRequestId: string,
) {
  return client.request<RideRequestLifecycleResponse>(
    `${apiRoutes.rideRequests.root}/${rideRequestId}`,
    {
      method: "DELETE",
    },
  );
}

export async function resolveVoiceLocationIntentWithApi(
  client: OrbiApiClient,
  payload: { transcript: string },
) {
  return client.request<VoiceLocationIntentResponse>(
    apiRoutes.voice.locationIntent,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function createScheduledRideWithApi(
  client: OrbiApiClient,
  payload: CreateScheduledRidePayload,
) {
  return client.request<{ id: string } & ScheduledRide>(
    apiRoutes.scheduledRides.root,
    { method: "POST", body: payload },
  );
}

export async function fetchMyScheduledRidesWithApi(client: OrbiApiClient) {
  return client.request<{ rides: ScheduledRide[] }>(apiRoutes.scheduledRides.mine);
}

export async function cancelScheduledRideWithApi(
  client: OrbiApiClient,
  scheduledRideId: string,
  reason?: string,
) {
  return client.request<ScheduledRide>(
    `${apiRoutes.scheduledRides.root}/${scheduledRideId}`,
    { method: "DELETE", body: reason ? { reason } : undefined },
  );
}
