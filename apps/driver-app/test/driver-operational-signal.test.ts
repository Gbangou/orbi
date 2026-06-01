import {
  buildDriverFatigueMessage,
  buildDriverRouteSafetyBrief,
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
    ).toEqual(['Ride Check: Attention (ND)', 'Dernier signal: Long Stop']);
  });

  it('marks impossible route signals as blocking before sensitive trip actions', () => {
    const brief = buildDriverRouteSafetyBrief({
      now: Date.parse('2026-04-19T08:15:00.000Z'),
      routeMonitoring: {
        state: 'clear',
        alertCount: 0,
        lastAlertType: null,
        lastAlertAt: null,
        lastPositionAt: '2026-04-19T08:02:30.000Z',
        latestPosition: {
          latitude: 12.37,
          longitude: -1.52,
          accuracyMeters: 380,
          speedKph: 128,
          distanceToPickupKm: 0.2,
          distanceToDestinationKm: 6.1,
          observedAt: '2026-04-19T08:02:30.000Z',
          sourceRole: 'DRIVER',
        },
      },
    });

    expect(brief).toEqual(
      expect.objectContaining({
        tone: 'rose',
        blocksCompletion: true,
        title: 'Mission a verifier avant action sensible',
      }),
    );
    expect(brief.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Fraicheur', value: '13 min' }),
        expect.objectContaining({ label: 'Precision', value: '380 m' }),
        expect.objectContaining({ label: 'Vitesse', value: '128 km/h' }),
      ]),
    );
  });

  it('blocks completion when route detail is unavailable', () => {
    expect(
      buildDriverRouteSafetyBrief({
        now: Date.parse('2026-04-19T08:15:00.000Z'),
        routeMonitoring: null,
      }),
    ).toEqual(
      expect.objectContaining({
        tone: 'rose',
        blocksCompletion: true,
        title: 'Signal route indisponible',
        actionLabel:
          'Actualisez le direct, gardez le telephone ouvert et contactez le support si le signal ne revient pas.',
      }),
    );
  });

  it('blocks completion while the first driver GPS signal is still missing', () => {
    expect(
      buildDriverRouteSafetyBrief({
        now: Date.parse('2026-04-19T08:15:00.000Z'),
        routeMonitoring: {
          state: 'unknown',
          alertCount: 0,
          lastAlertType: null,
          lastAlertAt: null,
          lastPositionAt: null,
          latestPosition: null,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        tone: 'rose',
        blocksCompletion: true,
        title: 'Premier signal GPS attendu',
        actionLabel:
          'Restez dans l app, activez la localisation et attendez un signal avant finalisation.',
      }),
    );
  });

  it('keeps a fresh coherent route as non-blocking driver guidance', () => {
    expect(
      buildDriverRouteSafetyBrief({
        now: Date.parse('2026-04-19T08:03:00.000Z'),
        routeMonitoring: {
          state: 'clear',
          alertCount: 0,
          lastAlertType: null,
          lastAlertAt: null,
          lastPositionAt: '2026-04-19T08:02:30.000Z',
          latestPosition: {
            latitude: 12.37,
            longitude: -1.52,
            accuracyMeters: 18,
            speedKph: 22,
            distanceToPickupKm: 0.2,
            distanceToDestinationKm: 6.1,
            observedAt: '2026-04-19T08:02:30.000Z',
            sourceRole: 'DRIVER',
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        tone: 'teal',
        blocksCompletion: false,
        actionLabel: 'Continuez la mission normalement.',
      }),
    );
  });
});
