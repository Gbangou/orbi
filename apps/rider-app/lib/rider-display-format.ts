export function toFiniteRiderDisplayNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatRiderRatingLabel(
  value: unknown,
  options: { prefix?: string; fallback?: string } = {},
) {
  const numeric = toFiniteRiderDisplayNumber(value);

  if (numeric === null || numeric < 0) {
    return options.fallback ?? null;
  }

  return `${options.prefix ?? ''}${numeric.toFixed(1)}`;
}

export function formatRiderDistanceKm(value: unknown, fallback: string | null = null) {
  const numeric = toFiniteRiderDisplayNumber(value);

  if (numeric === null || numeric < 0) {
    return fallback;
  }

  return `${numeric.toFixed(1)} km`;
}

export function estimateRiderPickupEtaMinutes(distanceKm: unknown) {
  const numeric = toFiniteRiderDisplayNumber(distanceKm);

  return numeric !== null && numeric >= 0
    ? Math.max(1, Math.ceil(numeric * 3))
    : null;
}
