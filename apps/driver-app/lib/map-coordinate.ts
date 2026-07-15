export type MapCoordinatePair = {
  latitude: number;
  longitude: number;
};

export function toFiniteMapCoordinate(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeMapCoordinatePair(input: {
  latitude: unknown;
  longitude: unknown;
}): MapCoordinatePair | null {
  const latitude = toFiniteMapCoordinate(input.latitude);
  const longitude = toFiniteMapCoordinate(input.longitude);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

export function hasMapCoordinatePair(input: {
  latitude: unknown;
  longitude: unknown;
}) {
  return normalizeMapCoordinatePair(input) !== null;
}
