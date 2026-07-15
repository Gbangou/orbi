import type { DriverFatigueStatus } from '@orbi/api';
import { buildDriverShiftReadiness } from '../lib/driver-shift-readiness';
import type { DriverActiveFlowSummary } from '../lib/driver-active-flow';

const clearFatigue: DriverFatigueStatus = {
  state: 'clear',
  completedTrips: 2,
  drivingMinutes: 64,
  windowHours: 8,
  maxCompletedTrips: 8,
  maxDrivingMinutes: 300,
  restMinutes: 30,
  restUntil: null,
  reason: 'Aucun signal fatigue bloquant sur la fenetre recente.',
};

function buildFlow(overrides: Partial<DriverActiveFlowSummary> = {}): DriverActiveFlowSummary {
  return {
    activeTrip: null,
    activeFlowState: null,
    primaryStatusLabel: 'Online',
    primaryRouteLabel: null,
    operationalStatus: 'ONLINE',
    availabilityStatus: 'ONLINE',
    heroTitle: 'En ligne',
    visibleOffers: [],
    visibleOfferCount: 0,
    canReceiveOffers: true,
    availabilityLocked: false,
    ...overrides,
  };
}

describe('driver-shift-readiness', () => {
  it('marks an online driver as ready for dispatch', () => {
    const readiness = buildDriverShiftReadiness({
      flow: buildFlow({ visibleOfferCount: 2 }),
      fatigue: clearFatigue,
      earningsToday: 12500,
    });

    expect(readiness.title).toBe('Pret a choisir');
    expect(readiness.scoreLabel).toBe('94/100');
    expect(readiness.insights).toContainEqual({
      label: 'Jour',
      value: '12.5k XOF',
      tone: 'sky',
    });
  });

  it('normalizes stringified daily earnings before readiness copy', () => {
    const readiness = buildDriverShiftReadiness({
      flow: buildFlow({ visibleOfferCount: 1 }),
      fatigue: clearFatigue,
      earningsToday: '12500,5',
    });

    expect(readiness.insights).toContainEqual({
      label: 'Jour',
      value: '12.5k XOF',
      tone: 'sky',
    });
  });

  it('degrades dirty daily earnings without leaking invalid copy', () => {
    const readiness = buildDriverShiftReadiness({
      flow: buildFlow({ availabilityStatus: 'OFFLINE', operationalStatus: 'OFFLINE' }),
      fatigue: clearFatigue,
      earningsToday: 'sale',
    });

    expect(readiness.insights).toContainEqual({
      label: 'Jour',
      value: '0 XOF',
      tone: 'sky',
    });
  });

  it('prioritizes fatigue blocks above dispatch availability', () => {
    const readiness = buildDriverShiftReadiness({
      flow: buildFlow(),
      fatigue: {
        ...clearFatigue,
        state: 'blocked',
        completedTrips: 9,
        restMinutes: 45,
        reason: 'Pause obligatoire avant nouvelle course.',
      },
    });

    expect(readiness.title).toBe('Pause prioritaire');
    expect(readiness.scoreLabel).toBe('35/100');
    expect(readiness.note).toBe('Pause obligatoire avant nouvelle course.');
  });

  it('locks readiness copy for suspended profiles', () => {
    const readiness = buildDriverShiftReadiness({
      flow: buildFlow({
        operationalStatus: 'SUSPENDED',
        availabilityStatus: 'OFFLINE',
        canReceiveOffers: false,
      }),
      fatigue: clearFatigue,
    });

    expect(readiness.title).toBe('Reprise verrouillee');
    expect(readiness.tone).toBe('rose');
  });
});
