export type CoordinatePoint = {
  latitude: number;
  longitude: number;
};

export function hasDefinedCoordinates(location: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  return (
    location.latitude !== undefined &&
    location.latitude !== null &&
    location.longitude !== undefined &&
    location.longitude !== null
  );
}

// À synchroniser avec l'implémentation partagée rider/domain jusqu'à ce que
// Jest backend transforme le TypeScript du workspace hors de src/.
function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(
  start: CoordinatePoint,
  end: CoordinatePoint,
) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusKm * arc;
}

export function roundDistanceKm(value: number) {
  return Math.max(0.8, Math.round(value * 10) / 10);
}

// Road detour factor — Ouagadougou urban grid roads average 30% longer than straight-line
const ROAD_DETOUR_FACTOR = 1.3;

function resolveTrafficMultiplier(hour?: number): number {
  if (hour === undefined) return 1;
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 20)) return 1.3;
  if (hour >= 12 && hour < 14) return 1.15;
  return 1;
}

export function estimateDurationMinutes(
  distanceKm: number,
  zone?: 'URBAN_CORE' | 'URBAN_EDGE' | 'SEMI_URBAN',
  options?: { hour?: number },
) {
  const averageSpeedByZone = {
    URBAN_CORE: 22,
    URBAN_EDGE: 26,
    SEMI_URBAN: 30,
  } as const;
  const resolvedZone = zone ?? 'URBAN_CORE';
  const baseSpeedKmh = averageSpeedByZone[resolvedZone];
  const roadDistanceKm = distanceKm * ROAD_DETOUR_FACTOR;
  const trafficMultiplier = resolveTrafficMultiplier(options?.hour);
  const effectiveSpeedKmh = baseSpeedKmh / trafficMultiplier;
  const rollingMinutes = (roadDistanceKm / effectiveSpeedKmh) * 60;
  const boardingBufferMinutes = resolvedZone === 'URBAN_CORE' ? 4 : 3;

  return Math.max(4, Math.round(rollingMinutes + boardingBufferMinutes));
}
