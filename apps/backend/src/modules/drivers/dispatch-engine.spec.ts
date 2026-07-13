import {
  calculateMarketplaceFairnessSignal,
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

  it('keeps marketplace fairness balanced when rider price, payout and margin are healthy', () => {
    const signal = calculateMarketplaceFairnessSignal({
      fare: 1800,
      driverPayout: 1476,
      estimatedTripDistanceKm: 5.8,
      pickupDistanceKm: 1.1,
      vehicleType: 'MOTORCYCLE',
    });

    expect(signal.label).toBe('BALANCED');
    expect(signal.score).toBeGreaterThanOrEqual(70);
    expect(signal.summary).toContain('Rider');
    expect(signal.summary).toContain('Chauffeur');
    expect(signal.summary).toContain('Ops');
  });

  it('flags driver payout fairness when pickup effort makes the offer weak', () => {
    const signal = calculateMarketplaceFairnessSignal({
      fare: 1300,
      driverPayout: 1066,
      estimatedTripDistanceKm: 2.2,
      pickupDistanceKm: 10.5,
      vehicleType: 'MOTORCYCLE',
    });

    expect(signal.label).toBe('DRIVER_PAYOUT_WATCH');
    expect(signal.driverPayoutScore).toBeLessThan(68);
    expect(signal.summary).toContain('Payout chauffeur a surveiller');
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

  it('never reports an acceptance rate above 100% even when recent accepts outweigh older assignments', () => {
    // Reproduit un cas reel observe en production : les evenements sont des
    // sommes independantes ponderees par recence (demi-vie), pas un decompte
    // tire d'un meme total — plusieurs ACCEPTED tres recents peuvent peser
    // plus lourd qu'un lot d'ASSIGNED bien plus anciens (donc fortement
    // decayes), produisant un ratio brut superieur a 1 sans plafond explicite.
    const now = Date.parse('2026-04-24T16:00:00.000Z');
    const signal = evaluateDispatchBehaviorSignal({
      nowMs: now,
      halfLifeHours: 18,
      events: [
        // Assignations anciennes (poids fortement decaye apres plusieurs demi-vies).
        {
          action: 'DISPATCH_RESERVATION_ASSIGNED',
          createdAt: new Date('2026-04-20T16:00:00.000Z'),
        },
        // Acceptations tres recentes (poids proche de 1 chacune).
        {
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          createdAt: new Date('2026-04-24T15:59:00.000Z'),
        },
        {
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          createdAt: new Date('2026-04-24T15:58:00.000Z'),
        },
        {
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          createdAt: new Date('2026-04-24T15:57:00.000Z'),
        },
      ],
    });

    expect(signal.acceptanceRate).not.toBeNull();
    expect(signal.acceptanceRate as number).toBeLessThanOrEqual(1);
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
