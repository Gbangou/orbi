import {
  DistrictProfile,
  PricingCity,
  RideRequestStatus,
  ServiceTier,
  TripStatus,
  VehicleType,
} from '@prisma/client';
import {
  activeRideRequestLifecycleStatuses,
  activeTripLifecycleStatuses,
  allowedTripLifecycleTransitions,
  apiDistrictProfiles,
  apiPricingCities,
  apiServiceTiers,
  apiVehicleTypes,
  canDriverCompleteTrip,
  canDriverMarkArrived,
  canDriverStartTrip,
  canRiderCancelTrip,
  canRiderStopTrip,
  resolveTripLifecycleTransitionDecision,
  tripLifecycleEventByStatus,
} from '@orbi/domain';

function expectSameValues(
  actual: readonly string[],
  expected: readonly string[],
) {
  expect([...actual].sort()).toEqual([...expected].sort());
}

describe('domain and Prisma contracts', () => {
  it('keeps API enum values aligned with Prisma enum values', () => {
    expectSameValues(apiVehicleTypes, Object.values(VehicleType));
    expectSameValues(apiServiceTiers, Object.values(ServiceTier));
    expectSameValues(apiPricingCities, Object.values(PricingCity));
    expectSameValues(apiDistrictProfiles, Object.values(DistrictProfile));
  });

  it('keeps active ride request statuses aligned with Prisma', () => {
    expectSameValues(activeRideRequestLifecycleStatuses, [
      RideRequestStatus.REQUESTED,
      RideRequestStatus.MATCHED,
      RideRequestStatus.DRIVER_ARRIVING,
    ]);
  });

  it('keeps active trip statuses aligned with Prisma', () => {
    expectSameValues(activeTripLifecycleStatuses, [
      TripStatus.MATCHED,
      TripStatus.DRIVER_ARRIVING,
      TripStatus.IN_PROGRESS,
    ]);
  });

  it('keeps trip lifecycle transitions valid for Prisma statuses', () => {
    const prismaTripStatuses = Object.values(TripStatus);

    expectSameValues(
      Object.keys(allowedTripLifecycleTransitions),
      prismaTripStatuses,
    );

    for (const [fromStatus, nextStatuses] of Object.entries(
      allowedTripLifecycleTransitions,
    )) {
      expect(prismaTripStatuses).toContain(fromStatus);

      for (const nextStatus of nextStatuses) {
        expect(prismaTripStatuses).toContain(nextStatus);
      }
    }

    expect(tripLifecycleEventByStatus.DRIVER_ARRIVING).toBe('DRIVER_ARRIVING');
    expect(tripLifecycleEventByStatus.IN_PROGRESS).toBe('TRIP_STARTED');
    expect(tripLifecycleEventByStatus.COMPLETED).toBe('TRIP_COMPLETED');
    expect(tripLifecycleEventByStatus.CANCELLED).toBe('TRIP_CANCELLED');
  });

  it('keeps rider and driver trip action policy aligned with the field flow', () => {
    expect(canRiderCancelTrip(TripStatus.MATCHED)).toBe(true);
    expect(canRiderCancelTrip(TripStatus.DRIVER_ARRIVING)).toBe(true);
    expect(canRiderCancelTrip(TripStatus.IN_PROGRESS)).toBe(false);
    expect(canRiderStopTrip(TripStatus.IN_PROGRESS)).toBe(false);
    expect(canRiderStopTrip(TripStatus.COMPLETED)).toBe(false);

    expect(canDriverMarkArrived(TripStatus.MATCHED)).toBe(true);
    expect(canDriverStartTrip(TripStatus.DRIVER_ARRIVING)).toBe(true);
    expect(canDriverStartTrip(TripStatus.MATCHED)).toBe(false);
    expect(canDriverCompleteTrip(TripStatus.IN_PROGRESS)).toBe(true);
    expect(canDriverCompleteTrip(TripStatus.DRIVER_ARRIVING)).toBe(false);
  });

  it('enforces actor-aware trip lifecycle decisions', () => {
    expect(
      resolveTripLifecycleTransitionDecision({
        currentStatus: TripStatus.MATCHED,
        nextStatus: TripStatus.CANCELLED,
        actorRole: 'RIDER',
      }),
    ).toEqual({
      allowed: true,
      eventType: 'TRIP_CANCELLED',
      reason: null,
    });

    expect(
      resolveTripLifecycleTransitionDecision({
        currentStatus: TripStatus.MATCHED,
        nextStatus: TripStatus.DRIVER_ARRIVING,
        actorRole: 'RIDER',
      }),
    ).toEqual({
      allowed: false,
      eventType: null,
      reason: 'ACTOR_NOT_ALLOWED',
    });

    expect(
      resolveTripLifecycleTransitionDecision({
        currentStatus: TripStatus.DRIVER_ARRIVING,
        nextStatus: TripStatus.IN_PROGRESS,
        actorRole: 'DRIVER',
      }),
    ).toEqual({
      allowed: true,
      eventType: 'TRIP_STARTED',
      reason: null,
    });

    expect(
      resolveTripLifecycleTransitionDecision({
        currentStatus: TripStatus.IN_PROGRESS,
        nextStatus: TripStatus.COMPLETED,
        actorRole: 'RIDER',
      }),
    ).toEqual({
      allowed: false,
      eventType: null,
      reason: 'ACTOR_NOT_ALLOWED',
    });

    expect(
      resolveTripLifecycleTransitionDecision({
        currentStatus: TripStatus.COMPLETED,
        nextStatus: TripStatus.CANCELLED,
        actorRole: 'DRIVER',
      }),
    ).toEqual({
      allowed: false,
      eventType: null,
      reason: 'INVALID_SEQUENCE',
    });
  });
});
