import {
  buildDriverOfferDetailLines,
  buildDriverOfferInsights,
  buildDriverOfferNote,
  formatDriverOfferFare,
} from '../lib/offer-signal';

describe('driver offer signal helpers', () => {
  it('keeps dirty numeric offer fields out of driver-facing copy', () => {
    const dirtyOffer = {
      id: 'offer-dirty',
      riderName: 'Awa',
      pickup: 'Patte d Oie',
      destination: 'Koulouba',
      category: 'motorcycle',
      fare: Number.NaN,
      distanceKm: Number.NaN,
      etaToPickupMinutes: undefined,
      driverPayout: Number.NaN,
      pickupDistanceKm: Number.NaN,
      serviceRadiusKm: Number.NaN,
      dispatchScore: Number.NaN,
      offerConfidenceScore: Number.NaN,
      offerConfidenceLabel: null,
      reservationWindowSeconds: Number.NaN,
    } as never;

    expect(buildDriverOfferInsights(dirtyOffer)).toEqual([
      {
        label: 'Pickup',
        value: 'Indisponible',
        tone: 'teal',
      },
      {
        label: 'Priorite',
        value: 'Standard',
        tone: 'rose',
      },
      {
        label: 'Gain',
        value: 'Gain indisponible',
        tone: 'amber',
      },
    ]);
    expect(buildDriverOfferDetailLines(dirtyOffer)).toEqual([
      'Moto - trajet ND km - priorite dispatch -',
    ]);
    expect(buildDriverOfferNote(dirtyOffer)).toBeNull();
    expect(formatDriverOfferFare(dirtyOffer)).toBe('Prix indisponible');
  });

  it('surfaces marketplace fairness in driver offer detail lines', () => {
    const offer = {
      id: 'offer-fair',
      riderName: 'Awa',
      pickup: 'Patte d Oie',
      destination: 'Koulouba',
      category: 'motorcycle',
      fare: 1800,
      distanceKm: 5.8,
      etaToPickupMinutes: 4,
      driverPayout: 1476,
      pickupDistanceKm: 1.1,
      pickupDistanceSource: 'DRIVER_AND_PICKUP_COORDINATES',
      serviceRadiusKm: 8,
      dispatchScore: 86,
      offerConfidenceScore: 91,
      offerConfidenceLabel: 'PRIORITY',
      reservationWindowSeconds: 45,
      fairnessScore: 84,
      fairnessLabel: 'BALANCED',
      fairnessSummary:
        'Equilibre marketplace sain. Rider 88/100 - Chauffeur 78/100 - Ops 96/100.',
    } as never;

    expect(buildDriverOfferDetailLines(offer)).toContain(
      'Fairness marketplace: Equilibre marketplace sain. Rider 88/100 - Chauffeur 78/100 - Ops 96/100.',
    );
  });
});
