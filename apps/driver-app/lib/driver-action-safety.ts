import type { DriverOffer } from '@orbi/api';

export type DriverActionValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function normalizePickupCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

export function validatePickupCode(value: string): DriverActionValidationResult {
  return normalizePickupCode(value).length === 4
    ? { ok: true }
    : {
        ok: false,
        message: 'Le code pickup doit contenir exactement 4 chiffres.',
      };
}

export function validateOfferAction(input: {
  activeTripId?: string | null;
  offer: DriverOffer | undefined;
  now: number;
}): DriverActionValidationResult {
  if (input.activeTripId) {
    return {
      ok: false,
      message: 'Une course est deja active. Terminez-la avant de traiter une autre offre.',
    };
  }

  if (!input.offer) {
    return {
      ok: false,
      message: 'Cette offre n est plus disponible dans le flux chauffeur.',
    };
  }

  if (!isOfferStillReserved(input.offer, input.now)) {
    return {
      ok: false,
      message: 'Cette reservation a expire. Actualisez le direct avant toute action.',
    };
  }

  return { ok: true };
}

export function validateTripAdvance(_input: {
  blocksCompletion: boolean;
  nextStatus: 'DRIVER_ARRIVING' | 'IN_PROGRESS' | 'COMPLETED';
}): DriverActionValidationResult {
  return { ok: true };
}

function isOfferStillReserved(offer: DriverOffer, now: number) {
  if (!offer.reservationExpiresAt) {
    return true;
  }

  const expiresAtMs = new Date(offer.reservationExpiresAt).getTime();

  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs > now;
}
