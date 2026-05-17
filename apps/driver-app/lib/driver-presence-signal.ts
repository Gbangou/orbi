import type { recordTripRoutePositionWithApi } from "@orbi/api";

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
}) {
  const precision = Math.round(input.accuracyMeters ?? 0);

  return input.activeTripId
    ? `Position mission synchronisee. Precision ${precision} m.`
    : `Presence GPS synchronisee. Precision ${precision} m.`;
}

export function resolveDriverPresenceTrackingOptions(
  activeTripId?: string | null,
) {
  return {
    distanceInterval: activeTripId ? 25 : 120,
    timeInterval: activeTripId ? 5000 : 30000,
  };
}
