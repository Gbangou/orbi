/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />
import {
  buildDriverEarningsDeltaLabel,
  formatDriverEarningsAmount,
  formatDriverEarningsCount,
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
});
