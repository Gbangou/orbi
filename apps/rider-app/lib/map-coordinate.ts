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

export function parseMapCoordinateSelectionMessage(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 1_000) {
    return null;
  }

  try {
    const message = JSON.parse(raw) as {
      type?: unknown;
      lat?: unknown;
      lng?: unknown;
    };

    if (message.type !== 'MAP_COORDINATE_SELECTED') {
      return null;
    }

    return normalizeMapCoordinatePair({
      latitude: message.lat,
      longitude: message.lng,
    });
  } catch {
    return null;
  }
}
