import {
  buildDriverPresenceSyncedNote,
  buildDriverRoutePositionPayload,
  resolveDriverPresenceTrackingOptions,
} from '../lib/driver-presence-signal';

describe('driver-presence-signal', () => {
  it('builds a bounded route position payload from native GPS coordinates', () => {
    expect(
      buildDriverRoutePositionPayload({
        coords: {
          latitude: 12.371,
          longitude: -1.519,
          accuracy: 14.4,
          speed: 8.5,
        },
      }),
    ).toEqual({
      latitude: 12.371,
      longitude: -1.519,
      accuracyMeters: 14.4,
      speedKph: 30.6,
    });

    expect(
      buildDriverRoutePositionPayload({
        coords: {
          latitude: 12.371,
          longitude: -1.519,
          speed: -4,
        },
      }),
    ).toEqual({
      latitude: 12.371,
      longitude: -1.519,
      accuracyMeters: undefined,
      speedKph: 0,
    });
  });

  it('uses tighter GPS tracking while a trip is active', () => {
    expect(resolveDriverPresenceTrackingOptions('trip-1')).toEqual({
      distanceInterval: 45,
      timeInterval: 10000,
    });
    expect(resolveDriverPresenceTrackingOptions(null)).toEqual({
      distanceInterval: 120,
      timeInterval: 30000,
    });
  });

  it('labels active mission position separately from idle dispatch presence', () => {
    expect(
      buildDriverPresenceSyncedNote({
        accuracyMeters: 18.2,
        activeTripId: 'trip-1',
      }),
    ).toBe('Position mission synchronisee. Precision 18 m.');
    expect(
      buildDriverPresenceSyncedNote({
        accuracyMeters: 18.2,
      }),
    ).toBe('Presence GPS synchronisee. Precision 18 m.');
  });
});
