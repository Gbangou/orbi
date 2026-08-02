import { maskEmailForDisplay } from '@orbi/domain';
import {
  formatDriverOnboardingProgress,
  formatDriverProfileBytes,
  formatDriverProfileCount,
  formatDriverProfileDateTime,
  formatDriverProfileDistanceKm,
  formatDriverProfilePercent,
  formatDriverProfileRatioPercent,
  formatDriverProfileRating,
  resolveDriverProfileRatioTone,
} from '../lib/driver-profile-signal';

describe('driver profile signal helpers', () => {
  it('masks driver identity values for default profile display', () => {
    expect(maskEmailForDisplay('driver@orbi.app')).toBe('dr***@orbi.app');
    expect(maskEmailForDisplay('dirty-value')).toBe('Adresse masquée');
  });

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
    ).toBe('Profil ND/ND complete a ND%');
  });

  it('normalizes stringified profile metrics before display', () => {
    expect(formatDriverProfileCount('12,9')).toBe('12');
    expect(formatDriverProfilePercent('84,7')).toBe('84%');
    expect(formatDriverProfileRatioPercent('0,82')).toBe('82%');
    expect(resolveDriverProfileRatioTone('0,82')).toBe('teal');
    expect(formatDriverProfileDistanceKm('9,5')).toBe('9.5 km');
    expect(formatDriverProfileRating('4,8')).toBe('4.8/5');
    expect(formatDriverProfileBytes('2500000')).toBe('2.5 MB');
  });
});
