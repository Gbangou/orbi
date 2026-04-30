import { PICKUP_CODE_VISIBLE_STATUSES } from './trips.constants';
import {
  extractPickupCode,
  formatTripEventLabel,
  formatVehicleLabel,
  toAmount,
} from './trips.utils';

export function serializeTripDetail(trip: {
  id: string;
  rideRequestId: string;
  status: string;
  pickupAddress: string;
  destinationAddress: string;
  actualFare: unknown;
  currency: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  rider: { user: { fullName: string } };
  driver: { user: { fullName: string } };
  vehicle: { make: string; model: string };
  events: Array<{
    id: string;
    eventType: string;
    payload?: unknown;
    createdAt: Date;
  }>;
}) {
  return {
    trip: {
      id: trip.id,
      rideRequestId: trip.rideRequestId,
      status: trip.status,
      pickupAddress: trip.pickupAddress,
      destinationAddress: trip.destinationAddress,
      riderName: trip.rider.user.fullName,
      driverName: trip.driver.user.fullName,
      vehicleLabel: formatVehicleLabel(trip.vehicle),
      pickupCode: PICKUP_CODE_VISIBLE_STATUSES.includes(trip.status as never)
        ? extractPickupCode(trip.events)
        : null,
      actualFare: toAmount(trip.actualFare),
      currency: trip.currency,
      startedAt: trip.startedAt?.toISOString() ?? null,
      completedAt: trip.completedAt?.toISOString() ?? null,
      createdAt: trip.createdAt.toISOString(),
      timeline: trip.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        label: formatTripEventLabel(event.eventType),
        createdAt: event.createdAt.toISOString(),
      })),
    },
  };
}

export function serializeTripLifecycle(trip: {
  id: string;
  rideRequestId: string;
  status: string;
  actualFare: unknown;
  currency: string;
  pickupAddress?: string;
  destinationAddress?: string;
  rider?: { user: { fullName: string } };
  vehicle?: { make: string; model: string };
  pickupCode?: string | null;
  createdAt?: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  return {
    trip: {
      id: trip.id,
      rideRequestId: trip.rideRequestId,
      status: trip.status,
      pickupAddress: trip.pickupAddress,
      destinationAddress: trip.destinationAddress,
      riderName: trip.rider?.user.fullName,
      vehicleLabel: trip.vehicle ? formatVehicleLabel(trip.vehicle) : undefined,
      pickupCode: trip.pickupCode,
      actualFare: toAmount(trip.actualFare),
      currency: trip.currency,
      createdAt: trip.createdAt?.toISOString(),
      startedAt: trip.startedAt?.toISOString() ?? null,
      completedAt: trip.completedAt?.toISOString() ?? null,
    },
  };
}

export function serializeTripHistoryItem(trip: {
  id: string;
  pickupAddress: string;
  destinationAddress: string;
  status: string;
  actualFare: unknown;
  currency: string;
  completedAt: Date | null;
  createdAt: Date;
  events: Array<{ eventType: string; payload?: unknown }>;
  vehicle: { make: string; model: string };
}) {
  return {
    id: trip.id,
    pickupAddress: trip.pickupAddress,
    destinationAddress: trip.destinationAddress,
    status: trip.status,
    amount: toAmount(trip.actualFare),
    currency: trip.currency,
    vehicleLabel: formatVehicleLabel(trip.vehicle),
    pickupCode: PICKUP_CODE_VISIBLE_STATUSES.includes(trip.status as never)
      ? extractPickupCode(trip.events)
      : null,
    completedAt: trip.completedAt?.toISOString() ?? null,
    createdAt: trip.createdAt.toISOString(),
  };
}
