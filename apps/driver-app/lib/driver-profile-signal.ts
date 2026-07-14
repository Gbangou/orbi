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

function toFiniteProfileNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatDriverProfileCount(value: unknown, fallback = 'ND') {
  const numeric = toFiniteProfileNumber(value);
  return numeric !== null && numeric >= 0 ? String(Math.floor(numeric)) : fallback;
}

export function formatDriverProfilePercent(value: unknown) {
  const numeric = toFiniteProfileNumber(value);
  return numeric !== null && numeric >= 0
    ? `${Math.min(100, Math.floor(numeric))}%`
    : 'ND%';
}

export function formatDriverProfileRatioPercent(value: unknown, fallback = '—') {
  const numeric = toFiniteProfileNumber(value);
  return numeric !== null && numeric >= 0
    ? `${Math.round(Math.min(1, numeric) * 100)}%`
    : fallback;
}

export function resolveDriverProfileRatioTone(value: unknown) {
  const numeric = toFiniteProfileNumber(value);

  if (numeric === null) {
    return 'neutral' as const;
  }

  if (numeric >= 0.75) {
    return 'teal' as const;
  }

  if (numeric >= 0.55) {
    return 'amber' as const;
  }

  return 'danger' as const;
}

export function formatDriverProfileDistanceKm(value: unknown, fallback = 'ND') {
  const numeric = toFiniteProfileNumber(value);
  return numeric !== null && numeric >= 0 ? `${numeric} km` : `${fallback} km`;
}

export function formatDriverProfileRating(value: unknown, fallback = 'Nouvelle activite') {
  const numeric = toFiniteProfileNumber(value);
  return numeric !== null && numeric >= 0 ? `${numeric.toFixed(1)}/5` : fallback;
}

export function formatDriverProfileBytes(value: unknown) {
  const numeric = toFiniteProfileNumber(value);

  if (numeric === null || numeric <= 0) {
    return 'Taille indisponible';
  }

  if (numeric >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(1)} MB`;
  }

  return `${Math.round(numeric / 1_000)} KB`;
}

export function formatDriverOnboardingProgress(input: {
  completedItems: unknown;
  totalItems: unknown;
  readinessPercent: unknown;
}) {
  return `Dossier ${formatDriverProfileCount(input.completedItems)}/${formatDriverProfileCount(input.totalItems)} complete a ${formatDriverProfilePercent(input.readinessPercent)}`;
}
