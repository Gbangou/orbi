import {
  buildDriverOfferDecisionSummary,
  buildDriverOfferDetailLines,
  buildDriverOfferInsights,
  buildDriverOfferNote,
  formatDriverOfferDistance,
  formatDriverOfferFare,
  formatDriverOfferMoney,
  formatDriverOfferMinutes,
  toFiniteOfferNumber,
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
    expect(formatDriverOfferMoney(Number.NaN, undefined)).toBe('Gain indisponible');
    expect(formatDriverOfferDistance((dirtyOffer as { distanceKm: unknown }).distanceKm)).toBe(
      'Distance indisponible',
    );
    expect(formatDriverOfferMinutes((dirtyOffer as { etaToPickupMinutes: unknown }).etaToPickupMinutes)).toBe(
      'Indisponible',
    );
  });

  it('normalizes numeric offer values received as strings before formatting', () => {
    expect(toFiniteOfferNumber('12,75')).toBe(12.75);
    expect(formatDriverOfferDistance('1,25')).toBe('1.3 km');
    expect(formatDriverOfferMinutes('4,4')).toBe('4 min');
    expect(formatDriverOfferMoney('1500')).toContain('1 500');
    expect(formatDriverOfferMoney(null, '1800')).toContain('1 800');

    const offer = {
      id: 'offer-string-values',
      riderName: 'Awa',
      pickup: 'Patte d Oie',
      destination: 'Koulouba',
      category: 'motorcycle',
      fare: '1800',
      distanceKm: '5,8',
      etaToPickupMinutes: '4',
      driverPayout: '1500',
      pickupDistanceKm: '1,1',
      serviceRadiusKm: '8',
      dispatchScore: '86',
      offerConfidenceScore: '91',
      offerConfidenceLabel: 'PRIORITY',
      reservationWindowSeconds: '45',
    } as never;

    expect(formatDriverOfferFare(offer)).toContain('1 800');
    expect(buildDriverOfferInsights(offer)[0]).toEqual({
      label: 'Pickup',
      value: '4 min',
      tone: 'teal',
    });
    expect(buildDriverOfferDetailLines(offer)).toEqual(
      expect.arrayContaining([
        'Moto - trajet 5.8 km - priorite dispatch 86',
        'Pickup a 1.1 km',
        'Rayon actif: 8 km',
        'Confiance offre: PRIORITY (91/100)',
        'Fenetre d acceptation: 45s',
      ]),
    );
    expect(buildDriverOfferNote(offer)).toEqual({
      text: expect.stringContaining('Gain net estime: 1 500'),
      tone: 'sky',
    });
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
      driverPayout: 1500,
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

  it('summarizes driver offer decision with net gain, effort and share', () => {
    const summary = buildDriverOfferDecisionSummary({
      id: 'offer-decision',
      riderName: 'Awa',
      pickup: 'Patte d Oie',
      destination: 'Koulouba',
      category: 'motorcycle',
      fare: 1800,
      distanceKm: 5.8,
      pickupDistanceKm: 1.2,
      driverPayout: 1500,
      fairnessLabel: 'BALANCED',
    } as never);

    expect(summary.title).toContain('1 500');
    expect(summary.title).toContain('214 XOF/km effort');
    expect(summary.subtitle).toContain('83% du prix');
    expect(summary.tone).toBe('teal');
  });

  it('warns driver when fairness flags payout effort', () => {
    const summary = buildDriverOfferDecisionSummary({
      id: 'offer-watch',
      riderName: 'Awa',
      pickup: 'Patte d Oie',
      destination: 'Koulouba',
      category: 'motorcycle',
      fare: 1300,
      distanceKm: 2.2,
      pickupDistanceKm: 10.5,
      driverPayout: 1050,
      fairnessLabel: 'DRIVER_PAYOUT_WATCH',
    } as never);

    expect(summary.tone).toBe('amber');
    expect(summary.subtitle).toContain('surveiller');
  });
});
