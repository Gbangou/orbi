import {
  driverFatigueMaxCompletedTrips,
  driverFatigueMaxDrivingMinutes,
  driverFatigueRestMinutes,
  evaluateDriverFatigue,
} from './driver-fatigue.policy';

let _tripSeq = 0;

function makeTrip(startedAt: Date, completedAt: Date | null, id?: string) {
  return { id: id ?? `trip-id-${++_tripSeq}`, startedAt, completedAt };
}

const now = new Date('2026-05-25T10:00:00.000Z');

describe('evaluateDriverFatigue', () => {
  it('returns clear state when no trips have been completed', () => {
    const result = evaluateDriverFatigue({ now, trips: [] });

    expect(result.state).toBe('clear');
    expect(result.completedTrips).toBe(0);
    expect(result.drivingMinutes).toBe(0);
    expect(result.restUntil).toBeNull();
  });

  it('returns clear state when only in-progress trips exist (no completedAt)', () => {
    const result = evaluateDriverFatigue({
      now,
      trips: [makeTrip(new Date('2026-05-25T09:00:00.000Z'), null)],
    });

    expect(result.state).toBe('clear');
    expect(result.completedTrips).toBe(0);
  });

  it('returns warning state when one trip below the threshold remains', () => {
    const trips = Array.from(
      { length: driverFatigueMaxCompletedTrips - 1 },
      (_, i) =>
        makeTrip(
          new Date(now.getTime() - (i + 1) * 30 * 60000),
          new Date(now.getTime() - i * 30 * 60000),
          `trip-${i}`,
        ),
    );

    const result = evaluateDriverFatigue({ now, trips });

    expect(result.state).toBe('warning');
    expect(result.completedTrips).toBe(driverFatigueMaxCompletedTrips - 1);
  });

  it('blocks when completed trip count reaches the hard limit and rest has not elapsed', () => {
    const trips = Array.from(
      { length: driverFatigueMaxCompletedTrips },
      (_, i) =>
        makeTrip(
          new Date(now.getTime() - (i + 1) * 20 * 60000),
          new Date(now.getTime() - i * 20 * 60000 - 60000),
          `trip-${i}`,
        ),
    );

    const result = evaluateDriverFatigue({ now, trips });

    expect(result.state).toBe('blocked');
    expect(result.completedTrips).toBe(driverFatigueMaxCompletedTrips);
    expect(result.restUntil).toBeInstanceOf(Date);
  });

  it('does not block when the rest window has already expired', () => {
    const longAgo = new Date(
      now.getTime() - (driverFatigueRestMinutes + 5) * 60000,
    );
    const trips = Array.from(
      { length: driverFatigueMaxCompletedTrips },
      (_, i) =>
        makeTrip(
          new Date(longAgo.getTime() - (i + 1) * 20 * 60000),
          new Date(longAgo.getTime() - i * 20 * 60000),
          `trip-${i}`,
        ),
    );

    const result = evaluateDriverFatigue({ now, trips });

    expect(result.state).not.toBe('blocked');
    expect(result.restUntil).toBeNull();
  });

  it('blocks when total driving minutes reach the hard limit', () => {
    const tripDurationMinutes = driverFatigueMaxDrivingMinutes;
    const trip = makeTrip(
      new Date(now.getTime() - (tripDurationMinutes + 1) * 60000),
      new Date(now.getTime() - 60000),
    );

    const result = evaluateDriverFatigue({ now, trips: [trip] });

    expect(result.state).toBe('blocked');
    expect(result.drivingMinutes).toBeGreaterThanOrEqual(
      driverFatigueMaxDrivingMinutes,
    );
  });

  it('warns when driving minutes are within 45 minutes of the hard limit', () => {
    const tripDurationMinutes = driverFatigueMaxDrivingMinutes - 30;
    const trip = makeTrip(
      new Date(now.getTime() - (tripDurationMinutes + 1) * 60000),
      new Date(now.getTime() - 60000),
    );

    const result = evaluateDriverFatigue({ now, trips: [trip] });

    expect(result.state).toBe('warning');
  });

  it('surfaces correct policy constants through the result', () => {
    const result = evaluateDriverFatigue({ now, trips: [] });

    expect(result.windowHours).toBe(8);
    expect(result.maxCompletedTrips).toBe(driverFatigueMaxCompletedTrips);
    expect(result.maxDrivingMinutes).toBe(driverFatigueMaxDrivingMinutes);
    expect(result.restMinutes).toBe(driverFatigueRestMinutes);
  });
});
