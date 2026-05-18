import { formatXof } from '@orbi/ui';
import type { DriverEarningsResponse } from '@orbi/api';

export function isFiniteEarningsNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatDriverEarningsAmount(value: unknown) {
  return isFiniteEarningsNumber(value) ? formatXof(value) : 'Montant indisponible';
}

export function formatDriverEarningsCount(value: unknown) {
  return isFiniteEarningsNumber(value) && value >= 0 ? String(Math.floor(value)) : 'ND';
}

export function buildDriverEarningsDeltaLabel(previousToday: unknown, nextToday: unknown) {
  if (!isFiniteEarningsNumber(previousToday) || !isFiniteEarningsNumber(nextToday)) {
    return null;
  }

  if (nextToday <= previousToday) {
    return null;
  }

  return `Nouveau gain comptabilise: +${formatDriverEarningsAmount(nextToday - previousToday)} sur le jour.`;
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
    (value) => !isFiniteEarningsNumber(value) || value < 0,
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
    (trip) =>
      !isFiniteEarningsNumber(trip.payout) ||
      trip.payout < 0 ||
      !isFiniteEarningsNumber(trip.grossFare) ||
      trip.grossFare < 0 ||
      !isFiniteEarningsNumber(trip.platformFee) ||
      trip.platformFee < 0,
  );
  const hasDirtySettlement = settlementValues.some(
    (value) => !isFiniteEarningsNumber(value) || value < 0,
  );
  const hasInvertedWindow =
    isFiniteEarningsNumber(earnings.summary.today) &&
    isFiniteEarningsNumber(earnings.summary.week) &&
    isFiniteEarningsNumber(earnings.summary.month) &&
    (earnings.summary.today > earnings.summary.week ||
      earnings.summary.week > earnings.summary.month);
  const hasAnomaly =
    hasDirtySummary ||
    hasDirtyTrips ||
    hasDirtySettlement ||
    hasInvertedWindow ||
    earnings.summary.currency !== settlement.currency ||
    settlement.state === 'REVIEW_REQUIRED' ||
    settlement.anomalies.length > 0;

  return {
    payoutRateLabel: `${Math.round(settlement.payoutRate * 100)}% chauffeur`,
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
      : earnings.recentTrips.length > 0
        ? 'Les montants affiches sont des gains chauffeur nets issus des courses cloturees.'
        : 'Aucun payout recent a rapprocher pour le moment.',
  };
}
