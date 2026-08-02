import type {
  TripRoutePositionResponse,
  recordTripRoutePositionWithApi,
} from "@orbi/api";

export type DriverPresencePosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
  };
};

export type DriverRoutePositionPayload = Parameters<
  typeof recordTripRoutePositionWithApi
>[2];

export function buildDriverRoutePositionPayload(
  position: DriverPresencePosition,
): DriverRoutePositionPayload {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy ?? undefined,
    speedKph:
      typeof position.coords.speed === "number" &&
      Number.isFinite(position.coords.speed)
        ? Math.max(0, position.coords.speed * 3.6)
        : undefined,
  };
}

export function buildDriverPresenceSyncedNote(input: {
  accuracyMeters?: number | null;
  activeTripId?: string | null;
  latestPosition?: TripRoutePositionResponse["routeMonitoring"]["latestPosition"];
}) {
  const precision = Math.round(toFiniteRouteNumber(input.accuracyMeters) ?? 0);

  if (!input.activeTripId) {
    return `Position synchronisee. Precision ${precision} m.`;
  }

  const pickupDistance = formatRouteDistance(
    input.latestPosition?.distanceToPickupKm,
  );
  const destinationDistance = formatRouteDistance(
    input.latestPosition?.distanceToDestinationKm,
  );
  const routeProgress = [
    pickupDistance ? `depart ${pickupDistance}` : null,
    destinationDistance ? `destination ${destinationDistance}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return routeProgress
    ? `Position mission synchronisee. ${routeProgress}. Precision ${precision} m.`
    : `Position mission synchronisee. Precision ${precision} m.`;
}

export function resolveDriverPresenceTrackingOptions(
  activeTripId?: string | null,
) {
  return {
    distanceInterval: activeTripId ? 25 : 120,
    timeInterval: activeTripId ? 5000 : 30000,
  };
}

function toFiniteRouteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatRouteDistance(distanceKm: unknown) {
  const numeric = toFiniteRouteNumber(distanceKm);

  if (numeric === null || numeric < 0) {
    return null;
  }

  if (numeric < 1) {
    return `${Math.max(0, Math.round(numeric * 1000))} m`;
  }

  return `${numeric.toFixed(1)} km`;
}
