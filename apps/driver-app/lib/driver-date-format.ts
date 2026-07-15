export function toDriverDateMs(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();

  return Number.isFinite(time) ? time : null;
}

export function formatDriverTimelineTime(value: unknown, fallback = '--') {
  const time = toDriverDateMs(value);

  return time !== null
    ? new Date(time).toLocaleTimeString('fr-BF', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : fallback;
}

export function formatDriverRestUntilTime(value: unknown, fallback = null as string | null) {
  const time = toDriverDateMs(value);

  return time !== null
    ? new Date(time).toLocaleTimeString('fr-BF', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : fallback;
}

export function getDriverTimeLeftMs(expiresAt: unknown, now: unknown) {
  const expiresAtMs = toDriverDateMs(expiresAt);
  const nowMs = typeof now === 'number' && Number.isFinite(now) ? now : null;

  if (expiresAtMs === null || nowMs === null) {
    return null;
  }

  return expiresAtMs - nowMs;
}
