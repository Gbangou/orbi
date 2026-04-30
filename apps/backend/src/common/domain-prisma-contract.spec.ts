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
} from '@mobilis/domain';

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
  });
});
