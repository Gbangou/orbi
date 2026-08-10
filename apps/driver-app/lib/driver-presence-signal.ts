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
  timestamp?: number;
};

export type DriverRoutePositionPayload = Parameters<
  typeof recordTripRoutePositionWithApi
>[2];

export function buildDriverRoutePositionPayload(
  position: DriverPresencePosition,
): DriverRoutePositionPayload | null {
  if (!isUsableDriverPosition(position)) {
    return null;
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy ?? undefined,
    speedKph:
      typeof position.coords.speed === "number" &&
      Number.isFinite(position.coords.speed)
        ? Math.max(0, position.coords.speed * 3.6)
        : undefined,
    observedAt:
      typeof position.timestamp === "number" &&
      Number.isFinite(position.timestamp)
        ? new Date(position.timestamp).toISOString()
        : undefined,
  };
}

export function isUsableDriverPosition(
  position: DriverPresencePosition,
  now = Date.now(),
) {
  const { latitude, longitude, accuracy } = position.coords;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return false;
  }

  if (
    typeof position.timestamp === "number" &&
    Number.isFinite(position.timestamp) &&
    now - position.timestamp > 120_000
  ) {
    return false;
  }

  if (
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy > 1500
  ) {
    return false;
  }

  return true;
}

export function buildDriverPresenceSyncedNote(input: {
  accuracyMeters?: number | null;
  activeTripId?: string | null;
  latestPosition?: TripRoutePositionResponse["routeMonitoring"]["latestPosition"];
}) {
  const precision = Math.round(toFiniteRouteNumber(input.accuracyMeters) ?? 0);

  if (!input.activeTripId) {
    return `Position a jour. Precision ${precision} m.`;
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
    ? `Position course a jour. ${routeProgress}. Precision ${precision} m.`
    : `Position course a jour. Precision ${precision} m.`;
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
