import {
  calculateRiderDiscountedFare,
  calculateRiderPromoSavings,
  calculateRiderTripDurationMinutes,
  estimateRiderPickupEtaMinutes,
  formatRiderDateTime,
  formatRiderDistanceKm,
  formatRiderHistoryDate,
  formatRiderMoneyAmount,
  formatRiderRatingLabel,
  formatRiderShortDate,
  formatRiderTimelineTime,
  resolveRiderMoneyAmount,
  toFiniteRiderDisplayNumber,
} from '../lib/rider-display-format';

describe('rider display format helpers', () => {
  it('normalizes stringified rider display numbers', () => {
    expect(toFiniteRiderDisplayNumber('4,8')).toBe(4.8);
    expect(formatRiderRatingLabel('4,8')).toBe('4.8');
    expect(formatRiderRatingLabel('4.8', { prefix: '★ ' })).toBe('★ 4.8');
    expect(formatRiderDistanceKm('0,4')).toBe('0.4 km');
    expect(estimateRiderPickupEtaMinutes('0,4')).toBe(2);
    expect(resolveRiderMoneyAmount('2500,5')).toBe(2600);
    expect(formatRiderMoneyAmount('2500')).toContain('2');
  });

  it('degrades dirty rider display numbers without throwing', () => {
    expect(formatRiderRatingLabel(Number.NaN)).toBeNull();
    expect(formatRiderRatingLabel('sale', { fallback: 'ND' })).toBe('ND');
    expect(formatRiderDistanceKm(undefined, 'Distance indisponible')).toBe(
      'Distance indisponible',
    );
    expect(estimateRiderPickupEtaMinutes('sale')).toBeNull();
    expect(formatRiderMoneyAmount('sale')).toBe('Montant indisponible');
    expect(resolveRiderMoneyAmount(-1)).toBeNull();
  });

  it('calculates rider promo money without trusting dirty API values', () => {
    expect(calculateRiderDiscountedFare({ fare: '2500', discountBps: '1000' })).toBe(2300);
    expect(calculateRiderDiscountedFare({ fare: 'sale', discountBps: 1000 })).toBeNull();
    expect(calculateRiderDiscountedFare({ fare: 2500, discountBps: Number.NaN })).toBe(2500);
    expect(calculateRiderPromoSavings({ amount: '2250', discountBps: '1000' })).toBe(300);
    expect(calculateRiderPromoSavings({ amount: 2250, discountBps: 10000 })).toBeNull();
  });

  it('formats rider dates and durations without leaking invalid dates', () => {
    expect(formatRiderDateTime('not-a-date')).toBe('Date indisponible');
    expect(formatRiderShortDate('not-a-date')).toBe('—');
    expect(formatRiderHistoryDate(null)).toBe('—');
    expect(formatRiderTimelineTime(undefined)).toBe('—');
    expect(formatRiderDateTime('2026-04-19T08:02:30.000Z')).not.toContain('Invalid');
    expect(formatRiderShortDate('2026-04-19T08:02:30.000Z')).not.toContain('Invalid');
    expect(formatRiderHistoryDate('2026-04-19T08:02:30.000Z')).not.toContain('Invalid');
    expect(formatRiderTimelineTime('2026-04-19T08:02:30.000Z')).not.toContain('Invalid');
    expect(
      calculateRiderTripDurationMinutes({
        startedAt: '2026-04-19T08:00:00.000Z',
        completedAt: '2026-04-19T08:12:30.000Z',
      }),
    ).toBe(13);
    expect(
      calculateRiderTripDurationMinutes({
        startedAt: '2026-04-19T08:12:30.000Z',
        completedAt: '2026-04-19T08:00:00.000Z',
      }),
    ).toBeNull();
  });
});
