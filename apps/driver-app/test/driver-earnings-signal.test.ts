import {
  buildDriverEarningsTrustSummary,
  buildDriverEarningsDeltaLabel,
  formatDriverEarningsAmount,
  formatDriverEarningsCount,
  formatDriverEarningsRatioPercent,
  formatDriverTripCompletedAt,
  toFiniteEarningsNumber,
} from '../lib/driver-earnings-signal';

describe('driver earnings signal helpers', () => {
  it('keeps dirty numeric earnings fields out of driver-facing copy', () => {
    expect(formatDriverEarningsAmount(Number.NaN)).toBe('Montant indisponible');
    expect(formatDriverEarningsCount(Number.NaN)).toBe('ND');
    expect(buildDriverEarningsDeltaLabel(1000, Number.NaN)).toBeNull();
  });

  it('builds a safe positive earnings delta label', () => {
    expect(buildDriverEarningsDeltaLabel(1000, 2500)).toBe(
      `Nouveau gain comptabilise: +${formatDriverEarningsAmount(1500)} sur le jour.`,
    );
  });

  it('normalizes stringified earnings values before formatting', () => {
    expect(toFiniteEarningsNumber('12500')).toBe(12500);
    expect(toFiniteEarningsNumber('0,82')).toBe(0.82);
    expect(formatDriverEarningsAmount('12500')).toContain('12 500');
    expect(formatDriverEarningsCount('6,9')).toBe('6');
    expect(formatDriverEarningsRatioPercent('0,82')).toBe('82%');
    expect(buildDriverEarningsDeltaLabel('1000', '2500')).toBe(
      `Nouveau gain comptabilise: +${formatDriverEarningsAmount(1500)} sur le jour.`,
    );
  });

  it('formats dirty trip completion dates without leaking Invalid Date', () => {
    expect(formatDriverTripCompletedAt(null)).toBe('En attente de cloture');
    expect(formatDriverTripCompletedAt('not-a-date')).toBe('Date de cloture indisponible');
  });

  it('builds a net payout trust summary for recent completed trips', () => {
    const summary = buildDriverEarningsTrustSummary({
      summary: {
        currency: 'XOF',
        today: '3500',
        week: '12000',
        month: '44000',
        completedTrips: '3',
        averagePayout: '4000',
      },
      settlement: {
        currency: 'XOF',
        source: 'COMPLETED_TRIPS',
        payoutRateBps: 8200,
        payoutRate: '0,82',
        recentTripCount: '2',
        recentGrossFare: '9756',
        recentNetPayout: '8000',
        recentPlatformFee: '1756',
        state: 'RECONCILED',
        anomalies: [],
        calculatedAt: '2026-04-19T10:00:00.000Z',
      },
      recentTrips: [
        {
          id: 'trip-1',
          route: 'A vers B',
          payout: '3500',
          grossFare: '4268',
          platformFee: '768',
          status: 'COMPLETED',
          completedAt: '2026-04-19T08:40:00.000Z',
        },
        {
          id: 'trip-2',
          route: 'C vers D',
          payout: '4500',
          grossFare: '5488',
          platformFee: '988',
          status: 'COMPLETED',
          completedAt: '2026-04-19T09:40:00.000Z',
        },
      ],
    });

    expect(summary).toMatchObject({
      payoutRateLabel: '82% chauffeur',
      recentNetPayoutLabel: formatDriverEarningsAmount(8000),
      estimatedPlatformFeeLabel: formatDriverEarningsAmount(1756),
      settlementStateLabel: 'Lisible',
      settlementTone: 'sky',
    });
  });

  it('shows a payout-rate range when recent trips span commission tiers', () => {
    const summary = buildDriverEarningsTrustSummary({
      summary: {
        currency: 'XOF',
        today: 8000,
        week: 8000,
        month: 8000,
        completedTrips: 2,
        averagePayout: 4000,
      },
      settlement: {
        currency: 'XOF',
        source: 'COMPLETED_TRIPS',
        payoutRateBps: 8600,
        payoutRate: 0.86,
        payoutRateMin: 0.82,
        payoutRateMax: 0.9,
        recentTripCount: 2,
        recentGrossFare: 9302,
        recentNetPayout: 8000,
        recentPlatformFee: 1302,
        state: 'RECONCILED',
        anomalies: [],
        calculatedAt: '2026-04-19T10:00:00.000Z',
      },
      recentTrips: [
        {
          id: 'trip-1',
          route: 'A vers B',
          payout: 4500,
          grossFare: 5000,
          platformFee: 500,
          commissionRate: 0.1,
          payoutRate: 0.9,
          status: 'COMPLETED',
          completedAt: '2026-04-19T08:40:00.000Z',
        },
        {
          id: 'trip-2',
          route: 'C vers D',
          payout: 3500,
          grossFare: 4302,
          platformFee: 802,
          commissionRate: 0.18,
          payoutRate: 0.82,
          status: 'COMPLETED',
          completedAt: '2026-04-19T09:40:00.000Z',
        },
      ],
    });

    expect(summary.payoutRateLabel).toBe('82%-90% chauffeur');
  });

  it('flags inverted finance windows before they reach driver copy', () => {
    const summary = buildDriverEarningsTrustSummary({
      summary: {
        currency: 'XOF',
        today: 14000,
        week: 12000,
        month: 44000,
        completedTrips: 3,
        averagePayout: 4000,
      },
      settlement: {
        currency: 'XOF',
        source: 'COMPLETED_TRIPS',
        payoutRateBps: 8200,
        payoutRate: 0.82,
        recentTripCount: 0,
        recentGrossFare: 0,
        recentNetPayout: 0,
        recentPlatformFee: 0,
        state: 'REVIEW_REQUIRED',
        anomalies: ['today_exceeds_week'],
        calculatedAt: '2026-04-19T10:00:00.000Z',
      },
      recentTrips: [],
    });

    expect(summary.settlementStateLabel).toBe('A verifier');
    expect(summary.settlementTone).toBe('amber');
  });
});
