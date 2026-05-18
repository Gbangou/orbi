import {
  normalizePickupCode,
  validateOfferAction,
  validatePickupCode,
  validateTripAdvance,
} from '../lib/driver-action-safety';

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
  it('normalizes pickup code input to four digits', () => {
    expect(normalizePickupCode('12a3-4<script>')).toBe('1234');
  });

  it('rejects incomplete pickup codes before API verification', () => {
    expect(validatePickupCode('123')).toEqual({
      ok: false,
      message: 'Le code pickup doit contenir exactement 4 chiffres.',
    });
  });

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

  it('blocks trip completion when Ride Check blocks completion', () => {
    expect(
      validateTripAdvance({
        blocksCompletion: true,
        nextStatus: 'COMPLETED',
      }),
    ).toEqual({
      ok: false,
      message: 'Finalisation bloquee par Ride Check. Actualisez le direct ou contactez le support.',
    });
  });
});
