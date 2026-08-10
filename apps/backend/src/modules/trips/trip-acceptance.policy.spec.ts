import { ServiceTier, VehicleType } from '@prisma/client';
import {
  evaluateRideRequestAcceptanceDecision,
  isAcceptableRideRequestStatus,
  selectCompatibleVehicle,
} from './trip-acceptance.policy';

describe('trip-acceptance.policy', () => {
  it('accepts only requested and matched ride-request statuses', () => {
    expect(isAcceptableRideRequestStatus('REQUESTED')).toBe(true);
    expect(isAcceptableRideRequestStatus('MATCHED')).toBe(true);
    expect(isAcceptableRideRequestStatus('CANCELLED')).toBe(false);
    expect(isAcceptableRideRequestStatus('COMPLETED')).toBe(false);
  });

  it('rejects a ride request actively reserved for another driver', () => {
    const decision = evaluateRideRequestAcceptanceDecision({
      driverProfileId: 'driver-1',
      now: new Date('2026-04-25T08:00:00.000Z'),
      rideRequest: {
        status: 'REQUESTED',
        assignedDriverId: 'driver-2',
        assignmentExpiresAt: new Date('2026-04-25T08:00:30.000Z'),
      },
    });

    expect(decision).toEqual({
      allowed: false,
      reason: 'OFFER_NOT_RESERVED_FOR_DRIVER',
    });
  });

  it('rejects an expired reservation instead of reclaiming it during accept', () => {
    const decision = evaluateRideRequestAcceptanceDecision({
      driverProfileId: 'driver-1',
      now: new Date('2026-04-25T08:00:00.000Z'),
      rideRequest: {
        status: 'REQUESTED',
        assignedDriverId: 'driver-2',
        assignmentExpiresAt: new Date('2026-04-25T07:59:30.000Z'),
      },
    });

    expect(decision).toEqual({
      allowed: false,
      reason: 'OFFER_NOT_RESERVED_FOR_DRIVER',
    });
  });

  it('accepts only a non-expired offer reserved for the driver', () => {
    const decision = evaluateRideRequestAcceptanceDecision({
      driverProfileId: 'driver-1',
      now: new Date('2026-04-25T08:00:00.000Z'),
      rideRequest: {
        status: 'MATCHED',
        assignedDriverId: 'driver-1',
        assignmentExpiresAt: new Date('2026-04-25T08:00:30.000Z'),
      },
    });

    expect(decision).toEqual({
      allowed: true,
      reservationState: 'RESERVED_FOR_DRIVER',
    });
  });

  it('selects the first compatible active vehicle for the request', () => {
    const vehicle = selectCompatibleVehicle(
      [
        {
          id: 'vehicle-car',
          type: VehicleType.CAR,
          tier: ServiceTier.CAR_STANDARD,
        },
        {
          id: 'vehicle-moto',
          type: VehicleType.MOTORCYCLE,
          tier: ServiceTier.MOTO_STANDARD,
        },
      ],
      {
        requestedVehicleType: VehicleType.MOTORCYCLE,
        requestedServiceTier: ServiceTier.MOTO_STANDARD,
      },
    );

    expect(vehicle?.id).toBe('vehicle-moto');
  });
});
