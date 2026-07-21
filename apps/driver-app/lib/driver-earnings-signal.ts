import { formatXof } from '@orbi/ui';
import type { DriverEarningsResponse } from '@orbi/api';

export function toFiniteEarningsNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function isFiniteEarningsNumber(value: unknown): value is number {
  return toFiniteEarningsNumber(value) !== null;
}

export function formatDriverEarningsAmount(value: unknown) {
  const numeric = toFiniteEarningsNumber(value);
  return numeric !== null ? formatXof(numeric) : 'Montant indisponible';
}

export function formatDriverEarningsCount(value: unknown) {
  const numeric = toFiniteEarningsNumber(value);
  return numeric !== null && numeric >= 0 ? String(Math.floor(numeric)) : 'ND';
}

export function formatDriverEarningsRatioPercent(value: unknown, fallback = '--') {
  const numeric = toFiniteEarningsNumber(value);
  return numeric !== null && numeric >= 0
    ? `${Math.round(Math.min(1, numeric) * 100)}%`
    : fallback;
}

function formatDriverPayoutRateLabel(settlement: DriverEarningsResponse['settlement']) {
  const min = toFiniteEarningsNumber(settlement.payoutRateMin);
  const max = toFiniteEarningsNumber(settlement.payoutRateMax);

  if (
    min !== null &&
    max !== null &&
    min >= 0 &&
    max >= 0 &&
    Math.round(min * 100) !== Math.round(max * 100)
  ) {
    return `${formatDriverEarningsRatioPercent(min, 'ND%')}-${formatDriverEarningsRatioPercent(max, 'ND%')} chauffeur`;
  }

  return `${formatDriverEarningsRatioPercent(settlement.payoutRate, 'ND%')} chauffeur`;
}

export function buildDriverEarningsDeltaLabel(previousToday: unknown, nextToday: unknown) {
  const previous = toFiniteEarningsNumber(previousToday);
  const next = toFiniteEarningsNumber(nextToday);

  if (previous === null || next === null) {
    return null;
  }

  if (next <= previous) {
    return null;
  }

  return `Nouveau gain comptabilise: +${formatDriverEarningsAmount(next - previous)} sur le jour.`;
}

export function formatDriverTripCompletedAt(completedAt: unknown) {
  if (typeof completedAt !== 'string' || completedAt.trim().length === 0) {
    return 'En attente de cloture';
  }

  const completedAtDate = new Date(completedAt);

  if (!Number.isFinite(completedAtDate.getTime())) {
    return 'Date de cloture indisponible';
  }

  return completedAtDate.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildDriverEarningsTrustSummary(
  earnings: DriverEarningsResponse,
) {
  const summaryValues = [
    earnings.summary.today,
    earnings.summary.week,
    earnings.summary.month,
    earnings.summary.completedTrips,
    earnings.summary.averagePayout,
  ];
  const hasDirtySummary = summaryValues.some(
    (value) => {
      const numeric = toFiniteEarningsNumber(value);
      return numeric === null || numeric < 0;
    },
  );
  const settlement = earnings.settlement;
  const settlementValues = [
    settlement.payoutRateBps,
    settlement.payoutRate,
    settlement.recentTripCount,
    settlement.recentGrossFare,
    settlement.recentNetPayout,
    settlement.recentPlatformFee,
  ];
  const hasDirtyTrips = earnings.recentTrips.some(
    (trip) => {
      const payout = toFiniteEarningsNumber(trip.payout);
      const grossFare = toFiniteEarningsNumber(trip.grossFare);
      const platformFee = toFiniteEarningsNumber(trip.platformFee);
      return (
        payout === null ||
        payout < 0 ||
        grossFare === null ||
        grossFare < 0 ||
        platformFee === null ||
        platformFee < 0
      );
    },
  );
  const hasDirtySettlement = settlementValues.some(
    (value) => {
      const numeric = toFiniteEarningsNumber(value);
      return numeric === null || numeric < 0;
    },
  );
  const today = toFiniteEarningsNumber(earnings.summary.today);
  const week = toFiniteEarningsNumber(earnings.summary.week);
  const month = toFiniteEarningsNumber(earnings.summary.month);
  const hasInvertedWindow =
    today !== null &&
    week !== null &&
    month !== null &&
    (today > week || week > month);
  const hasAnomaly =
    hasDirtySummary ||
    hasDirtyTrips ||
    hasDirtySettlement ||
    hasInvertedWindow ||
    earnings.summary.currency !== settlement.currency ||
    settlement.state === 'REVIEW_REQUIRED' ||
    settlement.anomalies.length > 0;
  const compensationWeek =
    toFiniteEarningsNumber(
      earnings.adjustments?.cancellationCompensationWeek,
    ) ?? 0;

  return {
    payoutRateLabel: formatDriverPayoutRateLabel(settlement),
    recentNetPayoutLabel: formatDriverEarningsAmount(settlement.recentNetPayout),
    estimatedPlatformFeeLabel: formatDriverEarningsAmount(
      settlement.recentPlatformFee,
    ),
    settlementStateLabel: hasAnomaly
      ? 'A verifier'
      : earnings.recentTrips.length > 0
        ? 'Lisible'
        : 'En attente',
    settlementTone: hasAnomaly ? ('amber' as const) : ('sky' as const),
    note: hasAnomaly
      ? 'Controle requis: une valeur finance semble incoherente ou hors devise attendue.'
      : compensationWeek > 0
        ? `Les revenus incluent ${formatDriverEarningsAmount(compensationWeek)} d indemnites annulation validees par operations cette semaine.`
      : earnings.recentTrips.length > 0
        ? 'Les montants affiches sont des gains chauffeur nets issus des courses cloturees.'
        : 'Aucun payout recent a rapprocher pour le moment.',
  };
}
