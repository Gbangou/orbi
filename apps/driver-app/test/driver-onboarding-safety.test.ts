import { parseDriverVehicleYear } from '../lib/driver-onboarding-safety';

describe('driver onboarding safety helpers', () => {
  it('parses bounded vehicle years strictly', () => {
    expect(parseDriverVehicleYear('2024')).toBe(2024);
    expect(parseDriverVehicleYear(2023)).toBe(2023);
    expect(parseDriverVehicleYear(' 2022 ')).toBe(2022);
  });

  it('falls back for partial, dirty, or out-of-range vehicle years', () => {
    expect(parseDriverVehicleYear('2024abc')).toBe(2020);
    expect(parseDriverVehicleYear('24')).toBe(2020);
    expect(parseDriverVehicleYear('1989')).toBe(2020);
    expect(parseDriverVehicleYear('2036')).toBe(2020);
    expect(parseDriverVehicleYear(Number.NaN)).toBe(2020);
  });
});
