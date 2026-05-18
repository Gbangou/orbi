import {
  buildCheckoutIdempotencyKey,
  buildRideRequestIdempotencyKey,
  validateBookingSelection,
} from '../lib/booking-safety';

const basePlace = {
  id: 'pickup',
  label: 'Depart',
  address: 'Patte d Oie, Ouagadougou',
  coordinates: {
    latitude: 12.3412,
    longitude: -1.5601,
  },
};

const destinationPlace = {
  id: 'destination',
  label: 'Destination',
  address: 'Ouaga 2000, Ouagadougou',
  coordinates: {
    latitude: 12.3274,
    longitude: -1.5339,
  },
};

const option = {
  id: 'moto-standard',
  category: 'motorcycle',
  tier: 'moto-standard',
  title: 'Moto Express',
  etaMinutes: 3,
  fare: 1200,
  capacity: '1 place',
  accent: '#2dd4bf',
  badge: 'Le plus rapide',
  paymentMethods: ['mobile-money', 'cash'],
  safetyNote: 'Code actif.',
} as const;

describe('rider booking safety helpers', () => {
  it('accepts a valid booking selection', () => {
    expect(
      validateBookingSelection({
        destinationPlace,
        hasOpenFlow: false,
        pickupPlace: basePlace,
        selectedOption: option,
        selectedPaymentMethod: 'cash',
      }),
    ).toEqual({
      ok: true,
      option,
    });
  });

  it('rejects unsupported payment methods before creating a ride request', () => {
    expect(
      validateBookingSelection({
        destinationPlace,
        hasOpenFlow: false,
        pickupPlace: basePlace,
        selectedOption: option,
        selectedPaymentMethod: 'wallet',
      }),
    ).toEqual({
      ok: false,
      message: 'Ce moyen de paiement n est pas disponible pour le service choisi.',
    });
  });

  it('builds stable URL-safe idempotency keys for booking and checkout', () => {
    expect(
      buildRideRequestIdempotencyKey({
        destinationAddress: destinationPlace.address,
        paymentMethod: 'mobile-money',
        pickupAddress: basePlace.address,
        riderId: 'rider-1',
        selectedCityId: 'OUAGADOUGOU',
        selectedOptionId: 'moto-standard',
      }),
    ).toBe(
      'ride-request-rider-1-ouagadougou-moto-standard-mobile-money-patte-d-oie-ouagadougou-ouaga-2000-ouagadougou',
    );

    expect(
      buildCheckoutIdempotencyKey({
        paymentMethod: 'mobile-money',
        rideRequestId: 'ride-request-12345678',
      }),
    ).toBe('checkout-ride-request-12345678-mobile-money');
  });
});
