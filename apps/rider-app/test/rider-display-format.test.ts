import {
  estimateRiderPickupEtaMinutes,
  formatRiderDistanceKm,
  formatRiderRatingLabel,
  toFiniteRiderDisplayNumber,
} from '../lib/rider-display-format';

describe('rider display format helpers', () => {
  it('normalizes stringified rider display numbers', () => {
    expect(toFiniteRiderDisplayNumber('4,8')).toBe(4.8);
    expect(formatRiderRatingLabel('4,8')).toBe('4.8');
    expect(formatRiderRatingLabel('4.8', { prefix: '★ ' })).toBe('★ 4.8');
    expect(formatRiderDistanceKm('0,4')).toBe('0.4 km');
    expect(estimateRiderPickupEtaMinutes('0,4')).toBe(2);
  });

  it('degrades dirty rider display numbers without throwing', () => {
    expect(formatRiderRatingLabel(Number.NaN)).toBeNull();
    expect(formatRiderRatingLabel('sale', { fallback: 'ND' })).toBe('ND');
    expect(formatRiderDistanceKm(undefined, 'Distance indisponible')).toBe(
      'Distance indisponible',
    );
    expect(estimateRiderPickupEtaMinutes('sale')).toBeNull();
  });
});
