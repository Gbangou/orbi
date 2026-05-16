export function formatDriverProfileDateTime(value: unknown, fallback = 'Date indisponible') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString('fr-FR');
}

function isFiniteProfileNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatDriverProfileCount(value: unknown, fallback = 'ND') {
  return isFiniteProfileNumber(value) && value >= 0 ? String(Math.floor(value)) : fallback;
}

export function formatDriverProfilePercent(value: unknown) {
  return isFiniteProfileNumber(value) && value >= 0
    ? `${Math.min(100, Math.floor(value))}%`
    : 'ND%';
}

export function formatDriverProfileDistanceKm(value: unknown, fallback = 'ND') {
  return isFiniteProfileNumber(value) && value >= 0 ? `${value} km` : `${fallback} km`;
}

export function formatDriverProfileRating(value: unknown, fallback = 'Nouvelle activite') {
  return isFiniteProfileNumber(value) && value >= 0 ? String(value) : fallback;
}

export function formatDriverProfileBytes(value: unknown) {
  if (!isFiniteProfileNumber(value) || value <= 0) {
    return 'Taille indisponible';
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} MB`;
  }

  return `${Math.round(value / 1_000)} KB`;
}

export function formatDriverOnboardingProgress(input: {
  completedItems: unknown;
  totalItems: unknown;
  readinessPercent: unknown;
}) {
  return `Dossier ${formatDriverProfileCount(input.completedItems)}/${formatDriverProfileCount(input.totalItems)} complete a ${formatDriverProfilePercent(input.readinessPercent)}`;
}
