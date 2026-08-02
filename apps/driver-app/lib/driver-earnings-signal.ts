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
  return numeric !== null ? formatXof(numeric) : 'Montant à confirmer';
}

export function formatDriverEarningsCompactAmount(value: unknown) {
  const numeric = toFiniteEarningsNumber(value);
  if (numeric === null) {
    return 'Indisponible';
  }

  return `${new Intl.NumberFormat('fr-BF', {
    maximumFractionDigits: 0,
  }).format(numeric)} F`;
}

export function formatDriverEarningsCount(value: unknown) {
  const numeric = toFiniteEarningsNumber(value);
  return numeric !== null && numeric >= 0 ? String(Math.floor(numeric)) : 'À confirmer';
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
    return `${formatDriverEarningsRatioPercent(min)}-${formatDriverEarningsRatioPercent(max)} chauffeur`;
  }

  return `${formatDriverEarningsRatioPercent(settlement.payoutRate)} chauffeur`;
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

  return `Nouveau gain comptabilisé: +${formatDriverEarningsAmount(next - previous)} aujourd'hui.`;
}

export function formatDriverTripCompletedAt(completedAt: unknown) {
  if (typeof completedAt !== 'string' || completedAt.trim().length === 0) {
    return 'En attente de clôture';
  }

  const completedAtDate = new Date(completedAt);

  if (!Number.isFinite(completedAtDate.getTime())) {
    return 'Date de clôture indisponible';
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
      ? 'Vérification requise'
      : earnings.recentTrips.length > 0
        ? 'Valide'
        : 'En attente',
    settlementTone: hasAnomaly ? ('amber' as const) : ('sky' as const),
    note: hasAnomaly
      ? 'Vérification requise: un montant doit être confirmé.'
      : compensationWeek > 0
        ? `Les revenus incluent ${formatDriverEarningsAmount(compensationWeek)} d'indemnités d'annulation validées cette semaine.`
      : earnings.recentTrips.length > 0
        ? 'Les montants affichés sont les gains nets des courses clôturées.'
        : 'Aucun paiement récent pour le moment.',
  };
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function buildDriverDailyOperatingCompass(
  earnings: DriverEarningsResponse,
  now = new Date(),
) {
  const todayAmount = toFiniteEarningsNumber(earnings.summary.today) ?? 0;
  const averagePayout =
    toFiniteEarningsNumber(earnings.summary.averagePayout) ?? 0;
  const todayTrips = earnings.recentTrips.filter((trip) => {
    if (typeof trip.completedAt !== 'string') return false;
    const completedAt = new Date(trip.completedAt);
    return Number.isFinite(completedAt.getTime()) && isSameLocalDay(completedAt, now);
  }).length;
  const observedTrips = todayTrips > 0
    ? todayTrips
    : Math.max(0, Math.floor(toFiniteEarningsNumber(earnings.summary.completedTrips) ?? 0));
  const targetTrips = averagePayout >= 4500 ? 5 : averagePayout >= 3000 ? 6 : 8;
  const targetAmount = Math.max(
    targetTrips * Math.max(averagePayout, 2500),
    15000,
  );
  const remainingTrips = Math.max(0, targetTrips - observedTrips);
  const remainingAmount = Math.max(0, targetAmount - todayAmount);
  const progressPercent = Math.min(100, Math.round((todayAmount / targetAmount) * 100));
  const gross = toFiniteEarningsNumber(earnings.settlement.recentGrossFare) ?? 0;
  const net = toFiniteEarningsNumber(earnings.settlement.recentNetPayout) ?? 0;
  const payoutRate = gross > 0 ? net / gross : toFiniteEarningsNumber(earnings.settlement.payoutRate);
  const payoutRateLabel = formatDriverEarningsRatioPercent(payoutRate);
  const primaryAction =
    remainingTrips <= 0
      ? 'Objectif atteint: gardez une présence sélective sur les offres très proches.'
      : observedTrips === 0
        ? 'Priorité: rester en ligne près des zones de départ denses et accepter une première course courte.'
        : remainingTrips <= 2
          ? 'Encore quelques courses courtes peuvent verrouiller une bonne journée.'
          : 'Cherchez les prises en charge courtes et les offres avec gain net clair avant les longs trajets.';

  return {
    targetAmountLabel: formatDriverEarningsAmount(targetAmount),
    remainingAmountLabel: formatDriverEarningsAmount(remainingAmount),
    remainingTrips,
    progressPercent,
    payoutRateLabel,
    primaryAction,
    headline:
      progressPercent >= 100
        ? 'Journée rentabilisée'
        : progressPercent >= 60
          ? 'Bonne cadence'
          : observedTrips > 0
            ? 'Cadence à renforcer'
            : 'Première course à sécuriser',
    indicators: [
      { label: 'Objectif', value: formatDriverEarningsAmount(targetAmount) },
      { label: 'Reste', value: formatDriverEarningsAmount(remainingAmount) },
      { label: 'Courses', value: remainingTrips === 0 ? 'OK' : `${remainingTrips} restantes` },
      { label: 'Part', value: payoutRateLabel },
    ],
  };
}
