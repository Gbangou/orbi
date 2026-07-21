import { formatXof } from '@orbi/ui';
import { roundXofForCashOperations } from '@orbi/domain';

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

  return formatXof(roundXofForCashOperations(numeric).amount);
}

export function resolveRiderMoneyAmount(value: unknown) {
  const numeric = toFiniteRiderDisplayNumber(value);

  return numeric !== null && numeric >= 0
    ? roundXofForCashOperations(numeric).amount
    : null;
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
  const discountedFare = roundXofForCashOperations(
    fare * (1 - boundedDiscountBps / 10000),
  ).amount;

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

  return roundXofForCashOperations(
    Math.max(0, amount * (discountBps / (10000 - discountBps))),
  ).amount;
}

function toValidRiderDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatRiderDateTime(
  value: unknown,
  fallback = 'Date indisponible',
) {
  const date = toValidRiderDate(value);

  return date
    ? date.toLocaleString('fr-BF', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : fallback;
}

export function formatRiderShortDate(value: unknown, fallback = '—') {
  const date = toValidRiderDate(value);

  return date
    ? date.toLocaleDateString('fr-BF', {
        day: '2-digit',
        month: 'short',
      })
    : fallback;
}

export function formatRiderHistoryDate(value: unknown, fallback = '—') {
  const date = toValidRiderDate(value);

  return date
    ? date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : fallback;
}

export function formatRiderTimelineTime(value: unknown, fallback = '—') {
  const date = toValidRiderDate(value);

  return date
    ? date.toLocaleTimeString('fr-BF', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : fallback;
}

export function calculateRiderTripDurationMinutes(input: {
  startedAt: unknown;
  completedAt: unknown;
}) {
  const startedAt = toValidRiderDate(input.startedAt);
  const completedAt = toValidRiderDate(input.completedAt);

  if (!startedAt || !completedAt) {
    return null;
  }

  const durationMinutes = Math.round(
    (completedAt.getTime() - startedAt.getTime()) / 60000,
  );

  return durationMinutes >= 0 ? durationMinutes : null;
}
