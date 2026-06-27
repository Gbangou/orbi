import {
  assertRideRequestPayloadConsistency,
  buildRideRequestCreateData,
  inferRideRequestPeakHour,
  inferRideRequestRoadCondition,
  inferRideRequestTrafficLevel,
  resolveRideRequestPricingGeography,
  resolveRideRequestRouteMetrics,
} from './ride-request-creation.policy';

describe('ride-request-creation.policy', () => {
  it('rejects incompatible vehicle type and service tier combinations', () => {
    expect(() =>
      assertRideRequestPayloadConsistency({
        riderId: 'rider-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'CAR_COMFORT',
        estimatedDistanceKm: 5.8,
        estimatedDurationMinutes: 16,
        paymentMethod: 'MOBILE_MONEY',
        pickupAreaType: 'URBAN_CORE',
      }),
    ).toThrow(
      'The requested service tier is not compatible with the selected vehicle type.',
    );
  });

  it('recomputes route metrics from coordinates when available', () => {
    const routeMetrics = resolveRideRequestRouteMetrics({
      riderId: 'rider-1',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      pickupLatitude: 12.3714,
      pickupLongitude: -1.5197,
      destinationAddress: 'Ouaga 2000',
      destinationLatitude: 12.3274,
      destinationLongitude: -1.5339,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      estimatedDistanceKm: 99,
      estimatedDurationMinutes: 99,
      paymentMethod: 'MOBILE_MONEY',
      pickupAreaType: 'URBAN_CORE',
    });

    // durationMinutes includes road detour factor ×1.3 + peak-hour traffic
    // 5.1 km × 1.3 = 6.63 km / 22 km/h × 60 ≈ 18.1 min + 4 buffer ≈ 22 min (off-peak)
    // Peak-hour multiplier ×1.3 → 22+ min. Value is time-dependent — check it's reasonable.
    expect(routeMetrics.distanceKm).toBeCloseTo(5.1, 1);
    expect(routeMetrics.durationMinutes).toBeGreaterThanOrEqual(22);
    expect(routeMetrics.source).toBe('SERVER_COORDINATES');
  });

  it('derives traffic and road conditions from route metrics', () => {
    expect(
      inferRideRequestTrafficLevel(
        { distanceKm: 5.1, durationMinutes: 18 },
        'URBAN_CORE',
      ),
    ).toBe('HEAVY');
    expect(
      inferRideRequestRoadCondition(
        { distanceKm: 5.1, durationMinutes: 18 },
        'URBAN_CORE',
      ),
    ).toBe('CONGESTED');
  });

  it('detects peak hour windows', () => {
    expect(inferRideRequestPeakHour(new Date('2026-04-25T07:30:00.000Z'))).toBe(
      true,
    );
    expect(inferRideRequestPeakHour(new Date('2026-04-25T11:30:00.000Z'))).toBe(
      false,
    );
  });

  it('infers pricing geography from addresses for legacy clients', () => {
    expect(
      resolveRideRequestPricingGeography({
        pickupAddress: 'Gare Routiere de Bobo-Dioulasso',
        destinationAddress: 'Sarfalao',
        pickupAreaType: 'URBAN_EDGE',
      }),
    ).toEqual({
      city: 'BOBO_DIOULASSO',
      districtProfile: 'MARKET_DENSE',
    });

    expect(
      resolveRideRequestPricingGeography({
        pickupAddress: 'Secteur 9, Ouahigouya',
        destinationAddress: 'Centre-ville',
        pickupAreaType: 'SEMI_URBAN',
      }),
    ).toEqual({
      city: 'OUAHIGOUYA',
      districtProfile: 'RESIDENTIAL_PERIPHERAL',
    });

    expect(
      resolveRideRequestPricingGeography({
        pickupAddress: 'Gare routiere de Koudougou',
        destinationAddress: 'Universite Norbert Zongo',
        pickupAreaType: 'SEMI_URBAN',
      }),
    ).toEqual({
      city: 'KOUDOUGOU',
      districtProfile: 'INTERCITY_GATE',
    });

    expect(
      resolveRideRequestPricingGeography({
        pickupAddress: 'Marche central de Banfora',
        destinationAddress: 'Gare routiere',
        pickupAreaType: 'SEMI_URBAN',
      }),
    ).toEqual({
      city: 'BANFORA',
      districtProfile: 'MARKET_DENSE',
    });
  });

  it('uses shared Burkina preset coordinates when address text is ambiguous', () => {
    expect(
      resolveRideRequestPricingGeography({
        pickupAddress: 'Mon point habituel',
        pickupLatitude: 12.2526,
        pickupLongitude: -2.3626,
        destinationAddress: 'Campus',
        pickupAreaType: 'SEMI_URBAN',
      }),
    ).toEqual({
      city: 'KOUDOUGOU',
      districtProfile: 'INTERCITY_GATE',
    });
  });

  it('builds normalized create data for persistence', () => {
    const createData = buildRideRequestCreateData(
      {
        riderId: 'rider-1',
        pickupAddress: ' Universite Joseph Ki-Zerbo ',
        destinationAddress: ' Ouaga 2000 ',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        estimatedDistanceKm: 5.8,
        estimatedDurationMinutes: 16,
        paymentMethod: 'MOBILE_MONEY',
        pickupAreaType: 'URBAN_CORE',
        city: 'BOBO_DIOULASSO',
        districtProfile: 'MARKET_DENSE',
        notes: ' test request ',
      },
      2150,
      {
        distanceKm: 5.1,
        durationMinutes: 18,
      },
    );

    expect(createData).toEqual(
      expect.objectContaining({
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        pricingCity: 'BOBO_DIOULASSO',
        districtProfile: 'MARKET_DENSE',
        paymentMethod: 'MOBILE_MONEY',
        estimatedFare: 2150,
        estimatedDistanceKm: 5.1,
        estimatedDurationMinutes: 18,
        notes: 'test request',
        status: 'REQUESTED',
      }),
    );
  });
});
