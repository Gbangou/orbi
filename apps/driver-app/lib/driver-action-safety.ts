import type { DriverOffer } from '@orbi/api';
import { toDriverDateMs } from './driver-date-format';

export type DriverActionValidationResult =
  | { ok: true }
  | { ok: false; message: string };

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
      message: 'Cette offre n est plus disponible.',
    };
  }

  if (!isOfferStillReserved(input.offer, input.now)) {
    return {
      ok: false,
      message: 'Cette reservation a expire. Actualisez avant toute action.',
    };
  }

  return { ok: true };
}

function isOfferStillReserved(offer: DriverOffer, now: number) {
  if (!offer.reservationExpiresAt) {
    return true;
  }

  const expiresAtMs = toDriverDateMs(offer.reservationExpiresAt);

  if (expiresAtMs === null) {
    return false;
  }

  return expiresAtMs > now;
}
