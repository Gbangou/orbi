import {
  buildDriverFatigueMessage,
  buildDriverRouteMonitoringLines,
} from '../lib/driver-operational-signal';

describe('driver operational signal helpers', () => {
  it('keeps dirty fatigue numbers out of driver-facing copy', () => {
    expect(
      buildDriverFatigueMessage({
        state: 'warning',
        completedTrips: 4,
        drivingMinutes: Number.NaN,
        windowHours: undefined,
        maxCompletedTrips: 8,
        maxDrivingMinutes: Number.NaN,
        restMinutes: 30,
        restUntil: null,
        reason: 'Pause conseillee.',
      } as never),
    ).toBe('Pause conseillee. ND/ND min sur NDh.');
  });

  it('keeps dirty route monitoring counts out of Ride Check copy', () => {
    expect(
      buildDriverRouteMonitoringLines({
        state: 'warning',
        alertCount: Number.NaN,
        lastAlertType: 'LONG_STOP',
        lastAlertAt: null,
        lastPositionAt: null,
        latestPosition: null,
      }),
    ).toEqual(['Ride Check: Warning (ND)', 'Dernier signal: Long Stop']);
  });
});
