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
});
