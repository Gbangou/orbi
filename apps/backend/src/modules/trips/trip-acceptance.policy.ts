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
      reservationState: 'RESERVED_FOR_DRIVER';
    }
  | {
      allowed: false;
      reason:
        | 'RIDE_REQUEST_UNAVAILABLE'
        | 'OFFER_NOT_RESERVED_FOR_DRIVER'
        | 'OFFER_EXPIRED';
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
      allowed: false,
      reason: 'OFFER_NOT_RESERVED_FOR_DRIVER',
    };
  }

  if (input.rideRequest.assignedDriverId === input.driverProfileId) {
    if (
      !input.rideRequest.assignmentExpiresAt ||
      input.rideRequest.assignmentExpiresAt.getTime() <= input.now.getTime()
    ) {
      return {
        allowed: false,
        reason: 'OFFER_EXPIRED',
      };
    }

    return {
      allowed: true,
      reservationState: 'RESERVED_FOR_DRIVER',
    };
  }

  return {
    allowed: false,
    reason: 'OFFER_NOT_RESERVED_FOR_DRIVER',
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
