import {
  formatReservationCountdown,
  getReservationTimeLeftMs,
  isOfferReservationActive,
} from '../lib/offer-reservation';

describe('driver offer reservation helpers', () => {
  const now = Date.parse('2026-05-15T12:00:00.000Z');

  it('formats valid reservation windows', () => {
    expect(
      formatReservationCountdown('2026-05-15T12:02:05.000Z', now),
    ).toBe('02:05');
  });

  it('treats invalid reservation dates as expired instead of rendering NaN', () => {
    expect(getReservationTimeLeftMs('not-a-date', now)).toBe(0);
    expect(formatReservationCountdown('not-a-date', now)).toBe('00:00');
    expect(
      isOfferReservationActive(
        {
          id: 'offer-1',
          reservationExpiresAt: 'not-a-date',
        } as never,
        now,
      ),
    ).toBe(false);
  });
});
