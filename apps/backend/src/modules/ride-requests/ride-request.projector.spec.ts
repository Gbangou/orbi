import { RideRequestProjector } from './ride-request.projector';

describe('RideRequestProjector', () => {
  const projector = new RideRequestProjector();

  it('projects a stable created ride-request response for rider surfaces', () => {
    const result = projector.projectCreatedRideRequest({
      rideRequest: {
        id: 'request-1',
        status: 'REQUESTED',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        estimatedFare: '2150',
        estimatedDistanceKm: '5.1',
        estimatedDurationMinutes: 18,
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        createdAt: new Date('2026-04-25T08:00:00.000Z'),
      },
      routeMetrics: {
        distanceKm: 5.1,
        durationMinutes: 18,
        source: 'SERVER_COORDINATES',
      },
      operatingContext: {
        demandLevel: 'HIGH',
        trafficLevel: 'HEAVY',
        weatherCondition: 'CLEAR',
        roadCondition: 'CONGESTED',
      },
      pricing: {
        estimatedFare: 2150,
        fareBreakdown: {
          reasons: ['Pic de demande modere sur la zone.'],
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        estimatedFare: 2150,
        estimatedDistanceKm: 5.1,
        routeMetricsSource: 'SERVER_COORDINATES',
        pricingContextSummary: 'HIGH - HEAVY - CONGESTED',
        pricingReason: 'Pic de demande modere sur la zone.',
      }),
    );
    expect(result.bookingReadinessSummary).toContain(
      'Metriques consolidees depuis les coordonnees serveur.',
    );
  });
});
