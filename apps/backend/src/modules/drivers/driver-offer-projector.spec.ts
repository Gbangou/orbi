import { ServiceTier, VehicleType } from '@prisma/client';
import { DriverOfferProjector } from './driver-offer-projector';

describe('DriverOfferProjector', () => {
  const projector = new DriverOfferProjector();

  it('projects a stable driver offer view model from dispatch inputs', () => {
    const offer = projector.project({
      id: 'request-1',
      riderName: 'Awa Rider',
      pickup: 'Patte d Oie',
      destination: 'Ouaga 2000',
      requestedVehicleType: VehicleType.MOTORCYCLE,
      fare: 1800,
      estimatedTripDistanceKm: 4.2,
      ageMinutes: 3,
      pickupDistanceKm: 1.4,
      serviceRadiusKm: 8,
      matchedTier: ServiceTier.MOTO_STANDARD,
      dispatchScore: 86,
      offerConfidenceScore: 91,
      offerConfidenceLabel: 'PRIORITY',
      reservationExpiresAt: '2026-04-24T16:00:30.000Z',
      reservationWindowSeconds: 45,
      availabilityScore: 74,
      demandLevel: 'HIGH',
      trafficLevel: 'HEAVY',
      dispatchBehavior: {
        score: 82,
        acceptanceRate: 0.7,
        declineRate: 0.1,
        expirationRate: 0.05,
        signalFreshness: 'RECENT',
      },
    });

    expect(offer).toEqual(
      expect.objectContaining({
        category: 'motorcycle',
        driverPayout: Math.round(1800 * 0.82),
        pickupDistanceSource: 'DRIVER_AND_PICKUP_COORDINATES',
        dispatchContextSummary: 'HIGH - HEAVY - dispo 74/100',
        offerConfidenceLabel: 'PRIORITY',
        reservationWindowSeconds: 45,
        fairnessLabel: 'BALANCED',
      }),
    );
    expect(offer.fairnessScore).toBeGreaterThan(70);
    expect(offer.fairnessBreakdown.driverPayoutScore).toBeGreaterThan(0);
    expect(offer.fairnessSummary).toContain('Rider');
    expect(offer.dispatchLearningSummary).toContain(
      'Memoire dispatch solide: acceptations recentes elevees.',
    );
  });

  it('falls back gracefully when pickup coordinates are unavailable', () => {
    const offer = projector.project({
      id: 'request-2',
      riderName: 'Moussa Rider',
      pickup: 'Boulmiougou',
      destination: 'Koulouba',
      requestedVehicleType: VehicleType.CAR,
      fare: 2900,
      estimatedTripDistanceKm: 7.2,
      ageMinutes: 8,
      pickupDistanceKm: null,
      serviceRadiusKm: 10,
      matchedTier: ServiceTier.CAR_STANDARD,
      dispatchScore: 61,
      offerConfidenceScore: 67,
      offerConfidenceLabel: 'MEDIUM',
      reservationExpiresAt: null,
      reservationWindowSeconds: 33,
      availabilityScore: 81,
      demandLevel: 'NORMAL',
      trafficLevel: 'MODERATE',
      dispatchBehavior: {
        score: 60,
        acceptanceRate: null,
        declineRate: null,
        expirationRate: null,
        signalFreshness: 'UNKNOWN',
      },
    });

    expect(offer.pickupDistanceSource).toBe('DISPATCH_FALLBACK');
    expect(offer.etaToPickupMinutes).toBe(7);
    expect(offer.dispatchLearningSummary).toContain('Memoire dispatch neutre');
  });

  it('sorts offers by dispatch score, pickup distance, fairness, then fare', () => {
    const strongest = projector.project({
      id: 'offer-strong',
      riderName: 'Strong Rider',
      pickup: 'A',
      destination: 'B',
      requestedVehicleType: VehicleType.MOTORCYCLE,
      fare: 1700,
      estimatedTripDistanceKm: 4,
      ageMinutes: 2,
      pickupDistanceKm: 1.1,
      serviceRadiusKm: 8,
      matchedTier: ServiceTier.MOTO_STANDARD,
      dispatchScore: 90,
      offerConfidenceScore: 88,
      offerConfidenceLabel: 'PRIORITY',
      reservationExpiresAt: null,
      reservationWindowSeconds: 45,
      availabilityScore: 76,
      demandLevel: 'HIGH',
      trafficLevel: 'HEAVY',
      dispatchBehavior: {
        score: 80,
        acceptanceRate: 0.6,
        declineRate: 0.1,
        expirationRate: 0.1,
        signalFreshness: 'HOT',
      },
    });
    const nearer = projector.project({
      id: 'offer-nearer',
      riderName: 'Near Rider',
      pickup: 'A',
      destination: 'B',
      requestedVehicleType: VehicleType.MOTORCYCLE,
      fare: 1500,
      estimatedTripDistanceKm: 4,
      ageMinutes: 2,
      pickupDistanceKm: 1.2,
      serviceRadiusKm: 8,
      matchedTier: ServiceTier.MOTO_STANDARD,
      dispatchScore: 78,
      offerConfidenceScore: 74,
      offerConfidenceLabel: 'HIGH',
      reservationExpiresAt: null,
      reservationWindowSeconds: 38,
      availabilityScore: 72,
      demandLevel: 'HIGH',
      trafficLevel: 'MODERATE',
      dispatchBehavior: {
        score: 72,
        acceptanceRate: 0.55,
        declineRate: 0.12,
        expirationRate: 0.08,
        signalFreshness: 'RECENT',
      },
    });
    const richerButFarther = projector.project({
      id: 'offer-richer',
      riderName: 'Far Rider',
      pickup: 'A',
      destination: 'B',
      requestedVehicleType: VehicleType.MOTORCYCLE,
      fare: 2200,
      estimatedTripDistanceKm: 4,
      ageMinutes: 2,
      pickupDistanceKm: 2.6,
      serviceRadiusKm: 8,
      matchedTier: ServiceTier.MOTO_STANDARD,
      dispatchScore: 78,
      offerConfidenceScore: 74,
      offerConfidenceLabel: 'HIGH',
      reservationExpiresAt: null,
      reservationWindowSeconds: 38,
      availabilityScore: 72,
      demandLevel: 'HIGH',
      trafficLevel: 'MODERATE',
      dispatchBehavior: {
        score: 72,
        acceptanceRate: 0.55,
        declineRate: 0.12,
        expirationRate: 0.08,
        signalFreshness: 'RECENT',
      },
    });
    const fairer = projector.project({
      id: 'offer-fairer',
      riderName: 'Fair Rider',
      pickup: 'A',
      destination: 'B',
      requestedVehicleType: VehicleType.MOTORCYCLE,
      fare: 1800,
      estimatedTripDistanceKm: 5.5,
      ageMinutes: 2,
      pickupDistanceKm: 2.6,
      serviceRadiusKm: 8,
      matchedTier: ServiceTier.MOTO_STANDARD,
      dispatchScore: 78,
      offerConfidenceScore: 74,
      offerConfidenceLabel: 'HIGH',
      reservationExpiresAt: null,
      reservationWindowSeconds: 38,
      availabilityScore: 72,
      demandLevel: 'HIGH',
      trafficLevel: 'MODERATE',
      dispatchBehavior: {
        score: 72,
        acceptanceRate: 0.55,
        declineRate: 0.12,
        expirationRate: 0.08,
        signalFreshness: 'RECENT',
      },
    });

    const ranked = [richerButFarther, fairer, nearer, strongest].sort(
      (left, right) => projector.comparePriority(left, right),
    );

    expect(ranked.map((offer) => offer.id)).toEqual([
      'offer-strong',
      'offer-nearer',
      'offer-fairer',
      'offer-richer',
    ]);
  });
});
