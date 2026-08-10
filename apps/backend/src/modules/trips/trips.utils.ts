import { TRIP_EVENT_LABELS } from './trips.constants';

export function toAmount(value: unknown) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

export function generatePickupCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function extractPickupCode(
  events: Array<{ eventType: string; payload?: unknown }>,
) {
  const pickupEvent = [...events].reverse().find(
    (event) => event.eventType === 'PICKUP_CODE_ISSUED',
  );
  const payload = isRecord(pickupEvent?.payload) ? pickupEvent.payload : null;
  const pickupCode = payload?.pickupCode;

  return typeof pickupCode === 'string' ? pickupCode : null;
}

export function resolvePickupCodeChallenge(
  events: Array<{ eventType: string; payload?: unknown; createdAt?: Date }>,
) {
  const issuedEvent = [...events].reverse().find(
    (event) => event.eventType === 'PICKUP_CODE_ISSUED',
  );
  const payload = isRecord(issuedEvent?.payload) ? issuedEvent.payload : null;
  const pickupCode =
    typeof payload?.pickupCode === 'string' ? payload.pickupCode : null;
  const expiresAt =
    typeof payload?.expiresAt === 'string' ? new Date(payload.expiresAt) : null;
  const maxAttempts =
    typeof payload?.maxAttempts === 'number' && Number.isFinite(payload.maxAttempts)
      ? payload.maxAttempts
      : null;
  const issuedAt = issuedEvent?.createdAt ?? null;
  const failedAttempts = events.filter((event) => {
    if (event.eventType !== 'PICKUP_CODE_VERIFICATION_FAILED') {
      return false;
    }

    if (!issuedAt || !event.createdAt) {
      return true;
    }

    return event.createdAt >= issuedAt;
  }).length;
  const latestFailedAttemptAt =
    [...events]
      .reverse()
      .find((event) => {
        if (event.eventType !== 'PICKUP_CODE_VERIFICATION_FAILED') {
          return false;
        }

        if (!issuedAt || !event.createdAt) {
          return true;
        }

        return event.createdAt >= issuedAt;
      })?.createdAt ?? null;

  return {
    pickupCode,
    issuedAt,
    expiresAt:
      expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    maxAttempts,
    failedAttempts,
    latestFailedAttemptAt,
  };
}

export function formatTripEventLabel(eventType: string) {
  return TRIP_EVENT_LABELS[eventType] ?? eventType;
}

export function formatVehicleLabel(vehicle: { make: string; model: string }) {
  return `${vehicle.make} ${vehicle.model}`;
}
