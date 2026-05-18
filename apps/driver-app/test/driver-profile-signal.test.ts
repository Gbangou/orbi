import {
  formatDriverOnboardingProgress,
  formatDriverProfileBytes,
  formatDriverProfileCount,
  formatDriverProfileDateTime,
  formatDriverProfileDistanceKm,
  formatDriverProfilePercent,
  formatDriverProfileRating,
} from '../lib/driver-profile-signal';

describe('driver profile signal helpers', () => {
  it('formats dirty profile dates without leaking Invalid Date', () => {
    expect(formatDriverProfileDateTime('not-a-date')).toBe('Date indisponible');
    expect(formatDriverProfileDateTime(null, 'En attente')).toBe('En attente');
  });

  it('formats valid profile dates through the French locale', () => {
    expect(formatDriverProfileDateTime('2026-04-19T08:40:00.000Z')).toContain('2026');
  });

  it('keeps dirty profile metrics out of driver-facing copy', () => {
    expect(formatDriverProfileCount(Number.NaN)).toBe('ND');
    expect(formatDriverProfilePercent(Number.NaN)).toBe('ND%');
    expect(formatDriverProfileDistanceKm(Number.NaN)).toBe('ND km');
    expect(formatDriverProfileRating(Number.NaN)).toBe('Nouvelle activite');
    expect(formatDriverProfileBytes(Number.NaN)).toBe('Taille indisponible');
    expect(
      formatDriverOnboardingProgress({
        completedItems: Number.NaN,
        totalItems: undefined,
        readinessPercent: Number.NaN,
      }),
    ).toBe('Dossier ND/ND complete a ND%');
  });
});
