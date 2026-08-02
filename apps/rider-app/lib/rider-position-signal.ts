import type { TripRoutePositionResponse } from "@orbi/api";

export function buildRiderPositionSyncedNote(input: {
  accuracyMeters?: number | null;
  activeTripId?: string | null;
  latestPosition?: TripRoutePositionResponse["routeMonitoring"]["latestPosition"];
}) {
  const precision = Math.round(toFiniteRouteNumber(input.accuracyMeters) ?? 0);

  if (!input.activeTripId) {
    return `Position passager a jour. Precision ${precision} m.`;
  }

  const destinationDistance = formatRouteDistance(
    input.latestPosition?.distanceToDestinationKm,
  );

  return destinationDistance
    ? `Position passager a jour. Destination ${destinationDistance}. Precision ${precision} m.`
    : `Position passager a jour. Precision ${precision} m.`;
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
