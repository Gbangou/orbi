import { formatXof } from '@orbi/ui';

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
