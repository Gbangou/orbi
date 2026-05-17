import { buildRiderPositionSyncedNote } from "../lib/rider-position-signal";

describe("rider-position-signal", () => {
  it("keeps idle GPS feedback focused on precision", () => {
    expect(
      buildRiderPositionSyncedNote({
        accuracyMeters: 17.6,
      }),
    ).toBe("Position passager synchronisee. Precision 18 m.");
  });

  it("summarizes backend destination progress during an active trip", () => {
    expect(
      buildRiderPositionSyncedNote({
        accuracyMeters: 17.6,
        activeTripId: "trip-1",
        latestPosition: {
          latitude: 12.371,
          longitude: -1.519,
          accuracyMeters: 17.6,
          speedKph: 0,
          distanceToPickupKm: 0.08,
          distanceToDestinationKm: 4.64,
          observedAt: "2026-05-17T20:00:00.000Z",
          sourceRole: "RIDER",
        },
      }),
    ).toBe(
      "Position passager synchronisee. Destination 4.6 km. Precision 18 m.",
    );
  });
});
