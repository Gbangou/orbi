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

export function extractPickupCode(
  events: Array<{ eventType: string; payload?: unknown }>,
) {
  const pickupEvent = events.find(
    (event) => event.eventType === 'PICKUP_CODE_ISSUED',
  );
  const payload =
    pickupEvent &&
    typeof pickupEvent.payload === 'object' &&
    pickupEvent.payload !== null
      ? (pickupEvent.payload as { pickupCode?: string })
      : null;

  return payload?.pickupCode ?? null;
}

export function formatTripEventLabel(eventType: string) {
  return TRIP_EVENT_LABELS[eventType] ?? eventType;
}

export function formatVehicleLabel(vehicle: { make: string; model: string }) {
  return `${vehicle.make} ${vehicle.model}`;
}
