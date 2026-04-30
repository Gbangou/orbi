import {
  calculateDispatchScore,
  evaluateDispatchBehaviorSignal,
  resolveAssignmentWindowMs,
  resolveOfferConfidenceLabel,
} from './dispatch-engine';

describe('dispatch-engine', () => {
  it('caps assignment windows inside the configured bounds', () => {
    expect(resolveAssignmentWindowMs(5)).toBeGreaterThanOrEqual(20_000);
    expect(resolveAssignmentWindowMs(99)).toBeLessThanOrEqual(50_000);
  });

  it('promotes stronger offers to higher confidence labels', () => {
    expect(resolveOfferConfidenceLabel(90)).toBe('PRIORITY');
    expect(resolveOfferConfidenceLabel(76)).toBe('HIGH');
    expect(resolveOfferConfidenceLabel(58)).toBe('MEDIUM');
    expect(resolveOfferConfidenceLabel(40)).toBe('LOW');
  });

  it('scores a nearby exact-tier request above a weak fallback request', () => {
    const strongScore = calculateDispatchScore({
      pickupDistanceKm: 1.2,
      estimatedTripDistanceKm: 6,
      ageMinutes: 2,
      hasExactTierMatch: true,
      availabilityScore: 82,
      supplyPressureLevel: 'BALANCED',
      demandLevel: 'HIGH',
      trafficLevel: 'MODERATE',
      roadCondition: 'OPEN',
    });

    const weakScore = calculateDispatchScore({
      pickupDistanceKm: 6.8,
      estimatedTripDistanceKm: 2,
      ageMinutes: 16,
      hasExactTierMatch: false,
      availabilityScore: 44,
      supplyPressureLevel: 'LOW',
      demandLevel: 'NORMAL',
      trafficLevel: 'GRIDLOCK',
      roadCondition: 'BLOCKED',
    });

    expect(strongScore).toBeGreaterThan(weakScore);
  });

  it('derives a strong behavior signal from recent acceptances', () => {
    const now = Date.parse('2026-04-24T16:00:00.000Z');
    const signal = evaluateDispatchBehaviorSignal({
      nowMs: now,
      halfLifeHours: 18,
      events: [
        {
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          createdAt: new Date('2026-04-24T15:55:00.000Z'),
        },
        {
          action: 'DISPATCH_RESERVATION_ASSIGNED',
          createdAt: new Date('2026-04-24T15:55:00.000Z'),
        },
        {
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          createdAt: new Date('2026-04-24T12:00:00.000Z'),
        },
        {
          action: 'DISPATCH_RESERVATION_ASSIGNED',
          createdAt: new Date('2026-04-24T12:00:00.000Z'),
        },
      ],
    });

    expect(signal.signalFreshness).toBe('HOT');
    expect(signal.acceptanceRate).not.toBeNull();
    expect(signal.score).toBeGreaterThan(70);
  });

  it('falls back to a neutral signal when no assignment history exists', () => {
    const signal = evaluateDispatchBehaviorSignal({
      nowMs: Date.parse('2026-04-24T16:00:00.000Z'),
      halfLifeHours: 18,
      events: [],
    });

    expect(signal.score).toBe(60);
    expect(signal.acceptanceRate).toBeNull();
    expect(signal.signalFreshness).toBe('UNKNOWN');
  });
});
