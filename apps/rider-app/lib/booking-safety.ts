import type { PaymentMethod, Place, RideOption } from '@orbi/api';

export type BookingValidationInput = {
  destinationPlace: Place;
  hasOpenFlow: boolean;
  pickupPlace: Place;
  selectedOption: RideOption | null;
  selectedPaymentMethod: PaymentMethod;
};

export type BookingValidationResult =
  | { ok: true; option: RideOption }
  | { ok: false; message: string };

export type BookingQuoteValidationInput = {
  confirmedOption: RideOption | null;
  quoteExpiresAt: number | null;
  nowMs: number;
  selectedOption: RideOption | null;
  selectedPaymentMethod: PaymentMethod;
};

export type BookingQuoteValidationResult =
  | { ok: true; option: RideOption }
  | { ok: false; reason: 'missing' | 'expired' | 'changed' | 'payment'; message: string };

function normalizePlaceText(value: string) {
  return value.trim().toLowerCase();
}

function isWholeFcfaAmount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function hasSameBackendQuote(left: RideOption, right: RideOption) {
  return (
    left.id === right.id &&
    left.category === right.category &&
    left.tier === right.tier &&
    left.etaMinutes === right.etaMinutes &&
    left.fare === right.fare
  );
}

function toIdempotencySegment(value: string | null | undefined) {
  return (
    normalizePlaceText(value ?? '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

export function areBookingPlacesEquivalent(left: Place, right: Place) {
  if (
    left.coordinates &&
    right.coordinates &&
    Math.abs(left.coordinates.latitude - right.coordinates.latitude) < 0.0001 &&
    Math.abs(left.coordinates.longitude - right.coordinates.longitude) < 0.0001
  ) {
    return true;
  }

  return normalizePlaceText(left.address) === normalizePlaceText(right.address);
}

export function validateBookingSelection(
  input: BookingValidationInput,
): BookingValidationResult {
  if (!input.selectedOption) {
    return {
      ok: false,
      message: 'Choisissez un service avant de confirmer la reservation.',
    };
  }

  if (input.hasOpenFlow) {
    return {
      ok: false,
      message: 'Une demande ou une course est deja active. Finalisez-la d abord.',
    };
  }

  if (areBookingPlacesEquivalent(input.pickupPlace, input.destinationPlace)) {
    return {
      ok: false,
      message: 'Le depart et la destination doivent etre differents.',
    };
  }

  if (
    input.selectedOption.paymentMethods?.length &&
    !input.selectedOption.paymentMethods.includes(input.selectedPaymentMethod)
  ) {
    return {
      ok: false,
      message: 'Ce moyen de paiement n est pas disponible pour le service choisi.',
    };
  }

  return {
    ok: true,
    option: input.selectedOption,
  };
}

export function validateBookingQuote(
  input: BookingQuoteValidationInput,
): BookingQuoteValidationResult {
  if (!input.selectedOption || !input.confirmedOption) {
    return {
      ok: false,
      reason: 'missing',
      message: 'Aucun service disponible pour ce trajet. Essayez un autre départ ou plus tard.',
    };
  }

  if (!input.quoteExpiresAt || input.nowMs > input.quoteExpiresAt) {
    return {
      ok: false,
      reason: 'expired',
      message: 'Le devis a expiré. Actualisez le prix avant de confirmer.',
    };
  }

  if (
    !isWholeFcfaAmount(input.selectedOption.fare) ||
    !isWholeFcfaAmount(input.confirmedOption.fare) ||
    !hasSameBackendQuote(input.selectedOption, input.confirmedOption)
  ) {
    return {
      ok: false,
      reason: 'changed',
      message: 'Le prix ou le délai a changé. Vérifiez le nouveau devis avant de confirmer.',
    };
  }

  if (
    input.confirmedOption.paymentMethods?.length &&
    !input.confirmedOption.paymentMethods.includes(input.selectedPaymentMethod)
  ) {
    return {
      ok: false,
      reason: 'payment',
      message: 'Ce moyen de paiement n est plus disponible pour ce service.',
    };
  }

  return {
    ok: true,
    option: input.confirmedOption,
  };
}

export function buildRideRequestIdempotencyKey(input: {
  destinationAddress: string;
  paymentMethod: PaymentMethod;
  pickupAddress: string;
  riderId?: string | null;
  selectedCityId: string;
  selectedOptionId: string;
}) {
  return [
    'ride-request',
    toIdempotencySegment(input.riderId ?? 'rider'),
    toIdempotencySegment(input.selectedCityId),
    toIdempotencySegment(input.selectedOptionId),
    toIdempotencySegment(input.paymentMethod),
    toIdempotencySegment(input.pickupAddress),
    toIdempotencySegment(input.destinationAddress),
  ]
    .join('-')
    .slice(0, 128);
}

export function resolveCheckoutChannel(paymentMethod: PaymentMethod) {
  return paymentMethod === 'wallet' ? 'WALLET' : 'MOBILE_MONEY';
}

export function buildCheckoutIdempotencyKey(input: {
  paymentMethod: PaymentMethod;
  rideRequestId: string;
}) {
  return `checkout-${toIdempotencySegment(input.rideRequestId)}-${toIdempotencySegment(
    input.paymentMethod,
  )}`.slice(0, 128);
}
