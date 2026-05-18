import {
  buildDriverEarningsTrustSummary,
  buildDriverEarningsDeltaLabel,
  formatDriverEarningsAmount,
  formatDriverEarningsCount,
  formatDriverTripCompletedAt,
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

  it('formats dirty trip completion dates without leaking Invalid Date', () => {
    expect(formatDriverTripCompletedAt(null)).toBe('En attente de cloture');
    expect(formatDriverTripCompletedAt('not-a-date')).toBe('Date de cloture indisponible');
  });

  it('builds a net payout trust summary for recent completed trips', () => {
    const summary = buildDriverEarningsTrustSummary({
      summary: {
        currency: 'XOF',
        today: 3500,
        week: 12000,
        month: 44000,
        completedTrips: 3,
        averagePayout: 4000,
      },
      recentTrips: [
        {
          id: 'trip-1',
          route: 'A vers B',
          payout: 3500,
          status: 'COMPLETED',
          completedAt: '2026-04-19T08:40:00.000Z',
        },
        {
          id: 'trip-2',
          route: 'C vers D',
          payout: 4500,
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
      recentTrips: [],
    });

    expect(summary.settlementStateLabel).toBe('A verifier');
    expect(summary.settlementTone).toBe('amber');
  });
});
