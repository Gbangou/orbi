import { resolveNearbyQueryNumber } from './drivers.controller';

describe('DriversController nearby query helpers', () => {
  it('accepts strict decimal query values and clamps them to bounds', () => {
    expect(resolveNearbyQueryNumber('12.36', -90, 90, 0)).toBe(12.36);
    expect(resolveNearbyQueryNumber(' -1.53 ', -180, 180, 0)).toBe(-1.53);
    expect(resolveNearbyQueryNumber('9999', 0.1, 50, 5)).toBe(50);
    expect(resolveNearbyQueryNumber('0', 0.1, 50, 5)).toBe(0.1);
  });

  it('rejects partial, exponent, empty, or non-finite nearby query values', () => {
    expect(resolveNearbyQueryNumber('12abc', -90, 90, 12.3647)).toBe(12.3647);
    expect(resolveNearbyQueryNumber('1e2', 0.1, 50, 5)).toBe(5);
    expect(resolveNearbyQueryNumber('', 0.1, 50, 5)).toBe(5);
    expect(resolveNearbyQueryNumber(undefined, 0.1, 50, 5)).toBe(5);
    expect(resolveNearbyQueryNumber('Infinity', 0.1, 50, 5)).toBe(5);
  });
});
