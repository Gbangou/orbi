import {
  calculateDistanceKm,
  estimateDurationMinutes,
  hasDefinedCoordinates,
  roundDistanceKm,
} from './route-metrics';

describe('hasDefinedCoordinates', () => {
  it('returns true when both latitude and longitude are finite numbers', () => {
    expect(hasDefinedCoordinates({ latitude: 12.365, longitude: -1.534 })).toBe(true);
  });

  it('returns false when latitude is null', () => {
    expect(hasDefinedCoordinates({ latitude: null, longitude: -1.534 })).toBe(false);
  });

  it('returns false when longitude is undefined', () => {
    expect(hasDefinedCoordinates({ latitude: 12.365, longitude: undefined })).toBe(false);
  });

  it('returns false when both coordinates are missing', () => {
    expect(hasDefinedCoordinates({})).toBe(false);
  });
});

describe('calculateDistanceKm', () => {
  it('returns 0 for identical points', () => {
    const point = { latitude: 12.365, longitude: -1.534 };
    expect(calculateDistanceKm(point, point)).toBeCloseTo(0, 3);
  });

  it('calculates the Haversine distance between two Ouagadougou landmarks within a plausible range', () => {
    const universiteKiZerbo = { latitude: 12.3714, longitude: -1.5197 };
    const ouaga2000 = { latitude: 12.3274, longitude: -1.5339 };

    const distanceKm = calculateDistanceKm(universiteKiZerbo, ouaga2000);

    expect(distanceKm).toBeGreaterThan(3);
    expect(distanceKm).toBeLessThan(7);
  });

  it('is symmetric — distance A→B equals distance B→A', () => {
    const a = { latitude: 12.3714, longitude: -1.5197 };
    const b = { latitude: 11.1858, longitude: -4.2864 };

    expect(calculateDistanceKm(a, b)).toBeCloseTo(calculateDistanceKm(b, a), 5);
  });

  it('measures Ouagadougou to Bobo-Dioulasso at roughly 340 km', () => {
    const ouaga = { latitude: 12.365, longitude: -1.534 };
    const bobo = { latitude: 11.177, longitude: -4.297 };

    const distanceKm = calculateDistanceKm(ouaga, bobo);

    expect(distanceKm).toBeGreaterThan(300);
    expect(distanceKm).toBeLessThan(380);
  });
});

describe('roundDistanceKm', () => {
  it('rounds to one decimal place', () => {
    expect(roundDistanceKm(5.456)).toBeCloseTo(5.5, 1);
  });

  it('enforces a minimum floor of 0.8 km', () => {
    expect(roundDistanceKm(0.3)).toBe(0.8);
    expect(roundDistanceKm(0)).toBe(0.8);
  });

  it('does not clamp distances above 0.8 km', () => {
    expect(roundDistanceKm(10.0)).toBeCloseTo(10.0, 1);
  });
});

describe('estimateDurationMinutes', () => {
  it('defaults to URBAN_CORE speed when no zone is specified', () => {
    const result = estimateDurationMinutes(5);
    expect(result).toBeGreaterThan(4);
    expect(result).toBeLessThan(25);
  });

  it('returns a longer estimate for URBAN_CORE than SEMI_URBAN for the same distance', () => {
    const urban = estimateDurationMinutes(10, 'URBAN_CORE');
    const semiUrban = estimateDurationMinutes(10, 'SEMI_URBAN');

    expect(urban).toBeGreaterThan(semiUrban);
  });

  it('enforces a minimum of 4 minutes for very short distances', () => {
    expect(estimateDurationMinutes(0.1, 'URBAN_CORE')).toBe(4);
  });

  it('returns a rounded integer', () => {
    const result = estimateDurationMinutes(7.3, 'URBAN_EDGE');
    expect(Number.isInteger(result)).toBe(true);
  });
});
