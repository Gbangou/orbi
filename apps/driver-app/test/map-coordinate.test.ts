import {
  hasMapCoordinatePair,
  normalizeMapCoordinatePair,
  toFiniteMapCoordinate,
} from '../lib/map-coordinate';

describe('driver map coordinate helpers', () => {
  it('normalizes numeric and stringified map coordinates', () => {
    expect(toFiniteMapCoordinate('12,3647')).toBe(12.3647);
    expect(
      normalizeMapCoordinatePair({
        latitude: '12,3647',
        longitude: '-1,5332',
      }),
    ).toEqual({ latitude: 12.3647, longitude: -1.5332 });
    expect(hasMapCoordinatePair({ latitude: 0, longitude: 0 })).toBe(true);
  });

  it('rejects dirty or out-of-bounds map coordinates', () => {
    expect(toFiniteMapCoordinate('sale')).toBeNull();
    expect(normalizeMapCoordinatePair({ latitude: -91, longitude: 0 })).toBeNull();
    expect(normalizeMapCoordinatePair({ latitude: 0, longitude: -181 })).toBeNull();
    expect(normalizeMapCoordinatePair({ latitude: Number.POSITIVE_INFINITY, longitude: 0 })).toBeNull();
  });
});
