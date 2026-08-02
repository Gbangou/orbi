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

  it('normalizes stringified fatigue numbers before driver-facing copy', () => {
    expect(
      buildDriverFatigueMessage({
        state: 'warning',
        completedTrips: '4',
        drivingMinutes: '91,8',
        windowHours: '8',
        maxCompletedTrips: '8',
        maxDrivingMinutes: '300',
        restMinutes: '30',
        restUntil: null,
        reason: 'Pause conseillee.',
      } as never),
    ).toBe('Pause conseillee. 91/300 min sur 8h.');
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
    ).toEqual(['Route mission: Attention (ND)', 'Dernière alerte: Long Stop']);
  });

  it('marks impossible route signals as operational review without trapping completion', () => {
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
        blocksCompletion: false,
        title: 'Course à contrôler après finalisation',
      }),
    );
    expect(brief.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Fraicheur', value: '13 min' }),
        expect.objectContaining({ label: 'Signal', value: '380 m' }),
        expect.objectContaining({ label: 'Vitesse', value: '128 km/h' }),
      ]),
    );
  });

  it('normalizes stringified route safety metrics before evaluating risk', () => {
    const brief = buildDriverRouteSafetyBrief({
      now: Date.parse('2026-04-19T08:15:00.000Z'),
      routeMonitoring: {
        state: 'clear',
        alertCount: '2',
        lastAlertType: null,
        lastAlertAt: null,
        lastPositionAt: '2026-04-19T08:02:30.000Z',
        latestPosition: {
          latitude: '12,37',
          longitude: '-1,52',
          accuracyMeters: '380,4',
          speedKph: '128,2',
          distanceToPickupKm: '0,2',
          distanceToDestinationKm: '6,1',
          observedAt: '2026-04-19T08:02:30.000Z',
          sourceRole: 'DRIVER',
        },
      } as never,
    });

    expect(brief).toEqual(
      expect.objectContaining({
        tone: 'rose',
        blocksCompletion: false,
      }),
    );
    expect(brief.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Signal', value: '380 m' }),
        expect.objectContaining({ label: 'Vitesse', value: '128 km/h' }),
        expect.objectContaining({ label: 'Alertes', value: '2', tone: 'amber' }),
      ]),
    );
  });

  it('keeps completion server-gated when route detail is unavailable locally', () => {
    expect(
      buildDriverRouteSafetyBrief({
        now: Date.parse('2026-04-19T08:15:00.000Z'),
        routeMonitoring: null,
      }),
    ).toEqual(
      expect.objectContaining({
        tone: 'amber',
        blocksCompletion: false,
        title: 'Position en synchronisation',
        actionLabel:
          'Gardez le telephone ouvert; la position sera vérifiée au moment de finaliser.',
      }),
    );
  });

  it('warns while the first driver GPS signal is still missing without trapping the driver locally', () => {
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
        tone: 'amber',
        blocksCompletion: false,
        title: 'Premiere position attendue',
        actionLabel:
          'Gardez la localisation active; la position recente sera verifiee avant de valider la fin.',
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
