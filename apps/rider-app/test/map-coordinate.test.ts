import {
  hasMapCoordinatePair,
  normalizeMapCoordinatePair,
  parseMapCoordinateSelectionMessage,
  toFiniteMapCoordinate,
} from '../lib/map-coordinate';

describe('rider map coordinate helpers', () => {
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
    expect(normalizeMapCoordinatePair({ latitude: 91, longitude: 0 })).toBeNull();
    expect(normalizeMapCoordinatePair({ latitude: 0, longitude: 181 })).toBeNull();
    expect(normalizeMapCoordinatePair({ latitude: Number.NaN, longitude: 0 })).toBeNull();
  });

  it('parses bounded WebView coordinate messages safely', () => {
    expect(
      parseMapCoordinateSelectionMessage(
        JSON.stringify({
          type: 'MAP_COORDINATE_SELECTED',
          lat: '12,3647',
          lng: '-1,5332',
        }),
      ),
    ).toEqual({ latitude: 12.3647, longitude: -1.5332 });
    expect(parseMapCoordinateSelectionMessage('{bad')).toBeNull();
    expect(parseMapCoordinateSelectionMessage('x'.repeat(1_001))).toBeNull();
    expect(
      parseMapCoordinateSelectionMessage(
        JSON.stringify({ type: 'MAP_COORDINATE_SELECTED', lat: 99, lng: 0 }),
      ),
    ).toBeNull();
  });
});
