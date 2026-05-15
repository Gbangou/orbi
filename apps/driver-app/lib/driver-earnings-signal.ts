import { formatXof } from '@mobilis/ui';

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
