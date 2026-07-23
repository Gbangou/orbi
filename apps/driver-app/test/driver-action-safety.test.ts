import { validateOfferAction } from '../lib/driver-action-safety';

const offer = {
  id: 'ride-request-1',
  riderName: 'Awa Ouedraogo',
  pickup: 'Patte d Oie',
  destination: 'Ouaga 2000',
  category: 'motorcycle',
  fare: 1200,
  currency: 'XOF',
  distanceKm: 4.2,
  etaToPickupMinutes: 4,
  pickupDistanceKm: 1.1,
  reservationExpiresAt: '2026-04-19T10:01:00.000Z',
} as never;

describe('driver action safety helpers', () => {
  it('blocks offer actions when another trip is active', () => {
    expect(
      validateOfferAction({
        activeTripId: 'trip-1',
        offer,
        now: Date.parse('2026-04-19T10:00:00.000Z'),
      }),
    ).toEqual({
      ok: false,
      message: 'Une course est deja active. Terminez-la avant de traiter une autre offre.',
    });
  });

  it('blocks expired offer actions before dispatch mutation', () => {
    expect(
      validateOfferAction({
        activeTripId: null,
        offer,
        now: Date.parse('2026-04-19T10:02:00.000Z'),
      }),
    ).toEqual({
      ok: false,
      message: 'Cette reservation a expire. Actualisez le direct avant toute action.',
    });
  });

  it('blocks malformed reservation dates before dispatch mutation', () => {
    expect(
      validateOfferAction({
        activeTripId: null,
        offer: {
          ...offer,
          reservationExpiresAt: 'not-a-date',
        },
        now: Date.parse('2026-04-19T10:00:00.000Z'),
      }),
    ).toEqual({
      ok: false,
      message: 'Cette reservation a expire. Actualisez le direct avant toute action.',
    });
  });
});
