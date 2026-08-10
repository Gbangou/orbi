import {
  buildDriverPresenceSyncedNote,
  buildDriverRoutePositionPayload,
  isUsableDriverPosition,
  resolveDriverPresenceTrackingOptions,
} from "../lib/driver-presence-signal";

describe("driver-presence-signal", () => {
  it("builds a bounded route position payload from native GPS coordinates", () => {
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

  it("rejects stale, inaccurate, and out-of-range GPS points before sync", () => {
    expect(
      isUsableDriverPosition(
        {
          coords: { latitude: 12.371, longitude: -1.519 },
          timestamp: Date.now() - 180_000,
        },
        Date.now(),
      ),
    ).toBe(false);
    expect(
      buildDriverRoutePositionPayload({
        coords: { latitude: 12.371, longitude: -1.519, accuracy: 2500 },
      }),
    ).toBeNull();
    expect(
      buildDriverRoutePositionPayload({
        coords: { latitude: 120, longitude: -1.519 },
      }),
    ).toBeNull();
  });

  it("uses tighter GPS tracking while a trip is active", () => {
    expect(resolveDriverPresenceTrackingOptions("trip-1")).toEqual({
      distanceInterval: 25,
      timeInterval: 5000,
    });
    expect(resolveDriverPresenceTrackingOptions(null)).toEqual({
      distanceInterval: 120,
      timeInterval: 30000,
    });
  });

  it("labels active mission position separately from idle dispatch presence", () => {
    expect(
      buildDriverPresenceSyncedNote({
        accuracyMeters: 18.2,
        activeTripId: "trip-1",
      }),
    ).toBe("Position course a jour. Precision 18 m.");
    expect(
      buildDriverPresenceSyncedNote({
        accuracyMeters: 18.2,
      }),
    ).toBe("Position a jour. Precision 18 m.");
  });

  it("summarizes backend route progress during an active mission", () => {
    expect(
      buildDriverPresenceSyncedNote({
        accuracyMeters: "18,2" as never,
        activeTripId: "trip-1",
        latestPosition: {
          latitude: 12.371,
          longitude: -1.519,
          accuracyMeters: 18.2,
          speedKph: 22,
          distanceToPickupKm: "0,24" as never,
          distanceToDestinationKm: "5,18" as never,
          observedAt: "2026-05-17T20:00:00.000Z",
          sourceRole: "DRIVER",
        },
      }),
    ).toBe(
      "Position course a jour. depart 240 m, destination 5.2 km. Precision 18 m.",
    );
  });
});
