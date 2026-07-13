import { PICKUP_CODE_VISIBLE_STATUSES } from './trips.constants';
import {
  extractPickupCode,
  formatTripEventLabel,
  formatVehicleLabel,
  toAmount,
} from './trips.utils';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPickupCodeVisibleStatus(status: string) {
  return (PICKUP_CODE_VISIBLE_STATUSES as readonly string[]).includes(status);
}

function shouldExposePickupCode(
  status: string,
  viewerRole?: string | null,
) {
  if (viewerRole === 'DRIVER') {
    return false;
  }

  return isPickupCodeVisibleStatus(status);
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

function haversineKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function resolveRouteMonitoringSummary(
  events: Array<{
    eventType: string;
    payload?: unknown;
    createdAt: Date;
  }>,
) {
  const routePositionEvents = events.filter(
    (event) => event.eventType === 'ROUTE_POSITION_RECORDED',
  );
  const latestRoutePosition =
    [...routePositionEvents].reverse().find((event) => {
      const payload = isRecord(event.payload) ? event.payload : {};

      return payload.sourceRole !== 'RIDER';
    }) ?? null;
  const routeAlertEvents = events.filter(
    (event) => event.eventType === 'ROUTE_MONITORING_ALERT',
  );
  const latestRouteAlert = routeAlertEvents.at(-1);
  const latestRouteAlertPayload = isRecord(latestRouteAlert?.payload)
    ? latestRouteAlert.payload
    : {};
  const latestRoutePositionPayload = isRecord(latestRoutePosition?.payload)
    ? latestRoutePosition.payload
    : {};
  const latestAlertType =
    typeof latestRouteAlertPayload.alertType === 'string'
      ? latestRouteAlertPayload.alertType
      : null;
  const latitude = toFiniteNumber(latestRoutePositionPayload.latitude);
  const longitude = toFiniteNumber(latestRoutePositionPayload.longitude);
  const distanceToDestinationKm = toFiniteNumber(
    latestRoutePositionPayload.distanceToDestinationKm,
  );

  return {
    state: latestRouteAlert
      ? latestRouteAlertPayload.severity === 'critical'
        ? 'critical'
        : 'warning'
      : latestRoutePosition
        ? 'clear'
        : 'unknown',
    alertCount: routeAlertEvents.length,
    lastAlertType: [
      'LONG_STOP',
      'ROUTE_DEVIATION',
      'NO_PROGRESS',
      'GPS_POSITION_ANOMALY',
      'PICKUP_MISMATCH',
    ].includes(latestAlertType ?? '')
      ? (latestAlertType as
          | 'LONG_STOP'
          | 'ROUTE_DEVIATION'
          | 'NO_PROGRESS'
          | 'GPS_POSITION_ANOMALY'
          | 'PICKUP_MISMATCH')
      : null,
    lastAlertAt: latestRouteAlert?.createdAt.toISOString() ?? null,
    lastPositionAt: latestRoutePosition?.createdAt.toISOString() ?? null,
    latestPosition:
      latestRoutePosition && latitude !== null && longitude !== null
        ? {
            latitude,
            longitude,
            accuracyMeters: toFiniteNumber(
              latestRoutePositionPayload.accuracyMeters,
            ),
            speedKph: toFiniteNumber(latestRoutePositionPayload.speedKph),
            distanceToPickupKm: null as number | null,
            distanceToDestinationKm,
            observedAt:
              typeof latestRoutePositionPayload.observedAt === 'string'
                ? latestRoutePositionPayload.observedAt
                : latestRoutePosition.createdAt.toISOString(),
            sourceRole:
              typeof latestRoutePositionPayload.sourceRole === 'string'
                ? latestRoutePositionPayload.sourceRole
                : null,
          }
        : null,
  };
}

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
  rider: {
    user: {
      fullName: string;
      phoneNumber?: string | null;
      isPhoneVerified?: boolean;
    };
  };
  driver: {
    verificationStatus: string;
    averageRating: unknown;
    completedTripsCount: number;
    profilePhotoUrl?: string | null;
    user: {
      fullName: string;
      isPhoneVerified: boolean;
      phoneNumber?: string | null;
    };
  };
  vehicle: {
    plateNumber: string;
    make: string;
    model: string;
    color: string;
    year?: number | null;
    seats?: number | null;
    type?: string;
    tier?: string;
  };
  rideRequest?: {
    pickupLatitude?: unknown;
    pickupLongitude?: unknown;
    destinationLatitude?: unknown;
    destinationLongitude?: unknown;
  } | null;
  promoCode?: { code: string; discountBps: number } | null;
  events: Array<{
    id: string;
    eventType: string;
    payload?: unknown;
    createdAt: Date;
  }>;
}, options: { viewerRole?: string | null } = {}) {
  const activeStatuses = ['MATCHED', 'DRIVER_ARRIVING', 'IN_PROGRESS'];
  const isActiveTrip = activeStatuses.includes(trip.status);
  const driverPhoneNumber =
    isActiveTrip &&
    trip.driver.user.isPhoneVerified &&
    trip.driver.user.phoneNumber
      ? trip.driver.user.phoneNumber
      : null;
  const riderPhoneNumber =
    isActiveTrip &&
    trip.rider.user.isPhoneVerified === true &&
    trip.rider.user.phoneNumber
      ? trip.rider.user.phoneNumber
      : null;
  const routeMonitoring = resolveRouteMonitoringSummary(trip.events);
  const pickupLatitude = toFiniteNumber(trip.rideRequest?.pickupLatitude);
  const pickupLongitude = toFiniteNumber(trip.rideRequest?.pickupLongitude);
  const destinationLatitude = toFiniteNumber(
    trip.rideRequest?.destinationLatitude,
  );
  const destinationLongitude = toFiniteNumber(
    trip.rideRequest?.destinationLongitude,
  );
  const latestPosition = routeMonitoring.latestPosition;

  if (latestPosition) {
    if (pickupLatitude !== null && pickupLongitude !== null) {
      latestPosition.distanceToPickupKm = Number(
        haversineKm(latestPosition, {
          latitude: pickupLatitude,
          longitude: pickupLongitude,
        }).toFixed(2),
      );
    }

    if (
      latestPosition.distanceToDestinationKm === null &&
      destinationLatitude !== null &&
      destinationLongitude !== null
    ) {
      latestPosition.distanceToDestinationKm = Number(
        haversineKm(latestPosition, {
          latitude: destinationLatitude,
          longitude: destinationLongitude,
        }).toFixed(2),
      );
    }
  }

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
      driverVerification: {
        verificationStatus: trip.driver.verificationStatus,
        phoneVerified: trip.driver.user.isPhoneVerified,
        averageRating:
          trip.driver.averageRating === null ||
          trip.driver.averageRating === undefined
            ? null
            : toAmount(trip.driver.averageRating),
        completedTripsCount: trip.driver.completedTripsCount,
        profilePhotoUrl: trip.driver.profilePhotoUrl ?? null,
        vehicle: {
          plateNumber: trip.vehicle.plateNumber,
          color: trip.vehicle.color,
          make: trip.vehicle.make,
          model: trip.vehicle.model,
          year: trip.vehicle.year ?? null,
          seats: trip.vehicle.seats ?? null,
          type: trip.vehicle.type,
          tier: trip.vehicle.tier,
        },
      },
      routeMonitoring,
      pickupCode: shouldExposePickupCode(trip.status, options.viewerRole)
        ? extractPickupCode(trip.events)
        : null,
      driverPhoneNumber,
      riderPhoneNumber,
      actualFare: toAmount(trip.actualFare),
      currency: trip.currency,
      pickupLatitude,
      pickupLongitude,
      destinationLatitude,
      destinationLongitude,
      startedAt: trip.startedAt?.toISOString() ?? null,
      completedAt: trip.completedAt?.toISOString() ?? null,
      createdAt: trip.createdAt.toISOString(),
      timeline: trip.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        label: formatTripEventLabel(event.eventType),
        createdAt: event.createdAt.toISOString(),
      })),
      promoCode: trip.promoCode ?? null,
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
}, options: { viewerRole?: string | null } = {}) {
  return {
    id: trip.id,
    pickupAddress: trip.pickupAddress,
    destinationAddress: trip.destinationAddress,
    status: trip.status,
    amount: toAmount(trip.actualFare),
    currency: trip.currency,
    vehicleLabel: formatVehicleLabel(trip.vehicle),
    pickupCode: shouldExposePickupCode(trip.status, options.viewerRole)
      ? extractPickupCode(trip.events)
      : null,
    completedAt: trip.completedAt?.toISOString() ?? null,
    createdAt: trip.createdAt.toISOString(),
  };
}
