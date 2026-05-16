/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />
import { formatDriverProfileDateTime } from '../lib/driver-profile-signal';

describe('driver profile signal helpers', () => {
  it('formats dirty profile dates without leaking Invalid Date', () => {
    expect(formatDriverProfileDateTime('not-a-date')).toBe('Date indisponible');
    expect(formatDriverProfileDateTime(null, 'En attente')).toBe('En attente');
  });

  it('formats valid profile dates through the French locale', () => {
    expect(formatDriverProfileDateTime('2026-04-19T08:40:00.000Z')).toContain('2026');
  });
});
