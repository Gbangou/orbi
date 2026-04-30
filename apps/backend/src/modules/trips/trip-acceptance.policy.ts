import { ServiceTier, VehicleType } from '@prisma/client';

export type AcceptanceVehicleCandidate = {
  id: string;
  type: VehicleType;
  tier: ServiceTier;
};

export type RideRequestAcceptanceSnapshot = {
  status: string;
  assignedDriverId: string | null;
  assignmentExpiresAt: Date | null;
};

export type RideRequestAcceptanceDecision =
  | {
      allowed: true;
      reservationState:
        | 'UNRESERVED'
        | 'RESERVED_FOR_DRIVER'
        | 'RESERVATION_EXPIRED';
    }
  | {
      allowed: false;
      reason: 'RIDE_REQUEST_UNAVAILABLE' | 'RESERVED_FOR_OTHER_DRIVER';
    };

export function isAcceptableRideRequestStatus(status: string) {
  return status === 'REQUESTED' || status === 'MATCHED';
}

export function evaluateRideRequestAcceptanceDecision(input: {
  rideRequest: RideRequestAcceptanceSnapshot;
  driverProfileId: string;
  now: Date;
}): RideRequestAcceptanceDecision {
  if (!isAcceptableRideRequestStatus(input.rideRequest.status)) {
    return {
      allowed: false,
      reason: 'RIDE_REQUEST_UNAVAILABLE',
    };
  }

  if (!input.rideRequest.assignedDriverId) {
    return {
      allowed: true,
      reservationState: 'UNRESERVED',
    };
  }

  if (input.rideRequest.assignedDriverId === input.driverProfileId) {
    return {
      allowed: true,
      reservationState: 'RESERVED_FOR_DRIVER',
    };
  }

  if (
    input.rideRequest.assignmentExpiresAt &&
    input.rideRequest.assignmentExpiresAt.getTime() <= input.now.getTime()
  ) {
    return {
      allowed: true,
      reservationState: 'RESERVATION_EXPIRED',
    };
  }

  return {
    allowed: false,
    reason: 'RESERVED_FOR_OTHER_DRIVER',
  };
}

export function selectCompatibleVehicle(
  vehicles: AcceptanceVehicleCandidate[],
  rideRequest: {
    requestedVehicleType: VehicleType;
    requestedServiceTier: ServiceTier | null;
  },
) {
  return vehicles.find(
    (vehicle) =>
      vehicle.type === rideRequest.requestedVehicleType &&
      (!rideRequest.requestedServiceTier ||
        vehicle.tier === rideRequest.requestedServiceTier),
  );
}
