import {
  formatDriverRestUntilTime,
  formatDriverTimelineTime,
  getDriverTimeLeftMs,
  toDriverDateMs,
} from '../lib/driver-date-format';

describe('driver date format helpers', () => {
  it('normalizes valid driver date inputs', () => {
    const iso = '2026-04-19T08:02:30.000Z';

    expect(toDriverDateMs(iso)).toBe(Date.parse(iso));
    expect(toDriverDateMs(new Date(iso))).toBe(Date.parse(iso));
    expect(formatDriverTimelineTime(iso)).not.toContain('Invalid');
    expect(formatDriverRestUntilTime(iso)).not.toContain('Invalid');
  });

  it('degrades invalid driver dates without leaking Invalid Date', () => {
    expect(toDriverDateMs('not-a-date')).toBeNull();
    expect(formatDriverTimelineTime('not-a-date')).toBe('--');
    expect(formatDriverRestUntilTime('not-a-date', 'heure indisponible')).toBe(
      'heure indisponible',
    );
    expect(
      getDriverTimeLeftMs(
        'not-a-date',
        Date.parse('2026-04-19T08:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it('calculates driver time left only when both dates are valid', () => {
    expect(
      getDriverTimeLeftMs(
        '2026-04-19T08:01:00.000Z',
        Date.parse('2026-04-19T08:00:00.000Z'),
      ),
    ).toBe(60_000);
    expect(getDriverTimeLeftMs('2026-04-19T08:01:00.000Z', Number.NaN)).toBeNull();
  });
});
