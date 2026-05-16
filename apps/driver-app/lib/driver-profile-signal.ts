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
