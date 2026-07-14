import {
  calculateRiderDiscountedFare,
  calculateRiderPromoSavings,
  estimateRiderPickupEtaMinutes,
  formatRiderDistanceKm,
  formatRiderMoneyAmount,
  formatRiderRatingLabel,
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
    expect(resolveRiderMoneyAmount('2500,5')).toBe(2500.5);
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
    expect(calculateRiderDiscountedFare({ fare: '2500', discountBps: '1000' })).toBe(2250);
    expect(calculateRiderDiscountedFare({ fare: 'sale', discountBps: 1000 })).toBeNull();
    expect(calculateRiderDiscountedFare({ fare: 2500, discountBps: Number.NaN })).toBe(2500);
    expect(calculateRiderPromoSavings({ amount: '2250', discountBps: '1000' })).toBe(250);
    expect(calculateRiderPromoSavings({ amount: 2250, discountBps: 10000 })).toBeNull();
  });
});
