import { formatXof } from '@orbi/ui';

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

export function formatRiderMoneyAmount(
  value: unknown,
  fallback = 'Montant indisponible',
) {
  const numeric = toFiniteRiderDisplayNumber(value);

  if (numeric === null || numeric < 0) {
    return fallback;
  }

  return formatXof(numeric);
}

export function resolveRiderMoneyAmount(value: unknown) {
  const numeric = toFiniteRiderDisplayNumber(value);

  return numeric !== null && numeric >= 0 ? numeric : null;
}

export function calculateRiderDiscountedFare(input: {
  fare: unknown;
  discountBps: unknown;
}) {
  const fare = resolveRiderMoneyAmount(input.fare);
  const discountBps = toFiniteRiderDisplayNumber(input.discountBps);

  if (fare === null) {
    return null;
  }

  if (discountBps === null || discountBps <= 0) {
    return fare;
  }

  const boundedDiscountBps = Math.min(Math.max(discountBps, 0), 10000);
  const discountedFare = Math.round(fare * (1 - boundedDiscountBps / 10000));

  return Math.max(1, discountedFare);
}

export function calculateRiderPromoSavings(input: {
  amount: unknown;
  discountBps: unknown;
}) {
  const amount = resolveRiderMoneyAmount(input.amount);
  const discountBps = toFiniteRiderDisplayNumber(input.discountBps);

  if (amount === null || discountBps === null || discountBps <= 0 || discountBps >= 10000) {
    return null;
  }

  return Math.max(0, Math.round(amount * (discountBps / (10000 - discountBps))));
}
