import type { TripRoutePositionResponse } from "@orbi/api";

export function buildRiderPositionSyncedNote(input: {
  accuracyMeters?: number | null;
  activeTripId?: string | null;
  latestPosition?: TripRoutePositionResponse["routeMonitoring"]["latestPosition"];
}) {
  const precision = Math.round(input.accuracyMeters ?? 0);

  if (!input.activeTripId) {
    return `Position passager synchronisee. Precision ${precision} m.`;
  }

  const destinationDistance = formatRouteDistance(
    input.latestPosition?.distanceToDestinationKm,
  );

  return destinationDistance
    ? `Position passager synchronisee. Destination ${destinationDistance}. Precision ${precision} m.`
    : `Position passager synchronisee. Precision ${precision} m.`;
}

function formatRouteDistance(distanceKm: number | null | undefined) {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) {
    return null;
  }

  if (distanceKm < 1) {
    return `${Math.max(0, Math.round(distanceKm * 1000))} m`;
  }

  return `${distanceKm.toFixed(1)} km`;
}
