import { useEffect, useState } from 'react';
import type { DriverOffer } from '@orbi/api';

export function useReservationClock() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return now;
}

export function getReservationTimeLeftMs(
  reservationExpiresAt: string | null | undefined,
  now: number,
) {
  if (!reservationExpiresAt) {
    return null;
  }

  const expiresAtMs = new Date(reservationExpiresAt).getTime();

  if (!Number.isFinite(expiresAtMs)) {
    return 0;
  }

  return expiresAtMs - now;
}

export function isOfferReservationActive(offer: DriverOffer, now: number) {
  const timeLeftMs = getReservationTimeLeftMs(offer.reservationExpiresAt, now);

  if (timeLeftMs === null) {
    return true;
  }

  return timeLeftMs > 0;
}

export function formatReservationCountdown(
  reservationExpiresAt: string | null | undefined,
  now: number,
) {
  const timeLeftMs = getReservationTimeLeftMs(reservationExpiresAt, now);

  if (timeLeftMs === null) {
    return null;
  }

  if (timeLeftMs <= 0) {
    return '00:00';
  }

  const totalSeconds = Math.ceil(timeLeftMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function useReservationExpiryRefresh(
  offers: DriverOffer[],
  refresh: () => void | Promise<void>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const upcomingExpirations = offers
      .map((offer) =>
        offer.reservationExpiresAt
          ? new Date(offer.reservationExpiresAt).getTime()
          : null,
      )
      .filter((value): value is number => value !== null)
      .filter((value) => value > Date.now())
      .sort((left, right) => left - right);

    const nextExpirationAt = upcomingExpirations[0];

    if (!nextExpirationAt) {
      return;
    }

    const delayMs = Math.max(250, nextExpirationAt - Date.now() + 150);
    const timeout = setTimeout(() => {
      void refresh();
    }, delayMs);

    return () => clearTimeout(timeout);
  }, [enabled, offers, refresh]);
}
