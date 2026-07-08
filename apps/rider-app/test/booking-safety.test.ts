import {
  areBookingPlacesEquivalent,
  buildCheckoutIdempotencyKey,
  buildRideRequestIdempotencyKey,
  resolveCheckoutChannel,
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
  title: 'Moto',
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

  it('accepts wallet only when the selected service exposes wallet support', () => {
    const walletOption = {
      ...option,
      paymentMethods: ['mobile-money', 'wallet'],
    } as const;

    expect(
      validateBookingSelection({
        destinationPlace,
        hasOpenFlow: false,
        pickupPlace: basePlace,
        selectedOption: walletOption,
        selectedPaymentMethod: 'wallet',
      }),
    ).toEqual({
      ok: true,
      option: walletOption,
    });
  });

  it('rejects same pickup and destination (equivalent places)', () => {
    expect(
      validateBookingSelection({
        destinationPlace: basePlace,
        hasOpenFlow: false,
        pickupPlace: basePlace,
        selectedOption: option,
        selectedPaymentMethod: 'cash',
      }),
    ).toMatchObject({ ok: false });
  });

  it('rejects when an open flow already exists', () => {
    expect(
      validateBookingSelection({
        destinationPlace,
        hasOpenFlow: true,
        pickupPlace: basePlace,
        selectedOption: option,
        selectedPaymentMethod: 'cash',
      }),
    ).toMatchObject({ ok: false });
  });

  it('rejects when no option is selected', () => {
    expect(
      validateBookingSelection({
        destinationPlace,
        hasOpenFlow: false,
        pickupPlace: basePlace,
        selectedOption: null,
        selectedPaymentMethod: 'cash',
      }),
    ).toMatchObject({ ok: false });
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

describe('areBookingPlacesEquivalent', () => {
  it('returns true for places with coordinates within 100m', () => {
    expect(
      areBookingPlacesEquivalent(
        { ...basePlace, coordinates: { latitude: 12.3412, longitude: -1.5601 } },
        { ...basePlace, coordinates: { latitude: 12.3412, longitude: -1.5601 } },
      ),
    ).toBe(true);
  });

  it('returns false for places far apart', () => {
    expect(
      areBookingPlacesEquivalent(basePlace, destinationPlace),
    ).toBe(false);
  });

  it('returns true when normalized addresses are identical even without coordinates', () => {
    const a = { id: 'a', label: 'A', address: '  Ouaga 2000  ' };
    const b = { id: 'b', label: 'B', address: 'ouaga 2000' };

    expect(areBookingPlacesEquivalent(a as never, b as never)).toBe(true);
  });
});

describe('resolveCheckoutChannel', () => {
  it('returns WALLET for the wallet payment method', () => {
    expect(resolveCheckoutChannel('wallet')).toBe('WALLET');
  });

  it('returns MOBILE_MONEY for mobile-money', () => {
    expect(resolveCheckoutChannel('mobile-money')).toBe('MOBILE_MONEY');
  });

  it('returns MOBILE_MONEY for cash', () => {
    expect(resolveCheckoutChannel('cash')).toBe('MOBILE_MONEY');
  });
});
