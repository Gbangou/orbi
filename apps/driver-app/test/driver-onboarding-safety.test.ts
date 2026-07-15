import {
  parseDriverVehicleYear,
  parseOptionalDriverVehicleYear,
  parseOptionalPositiveInteger,
} from '../lib/driver-onboarding-safety';

describe('driver onboarding safety helpers', () => {
  it('parses optional positive integers strictly', () => {
    expect(parseOptionalPositiveInteger('8')).toBe(8);
    expect(parseOptionalPositiveInteger(' 2 ')).toBe(2);
    expect(parseOptionalPositiveInteger(4)).toBe(4);
  });

  it('rejects partial, decimal, unsafe, or non-positive integers', () => {
    expect(parseOptionalPositiveInteger('8km')).toBeNull();
    expect(parseOptionalPositiveInteger('1.5')).toBeNull();
    expect(parseOptionalPositiveInteger('0')).toBeNull();
    expect(parseOptionalPositiveInteger('-1')).toBeNull();
    expect(parseOptionalPositiveInteger(Number.NaN)).toBeNull();
    expect(parseOptionalPositiveInteger(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });

  it('parses bounded vehicle years strictly', () => {
    expect(parseDriverVehicleYear('2024')).toBe(2024);
    expect(parseDriverVehicleYear(2023)).toBe(2023);
    expect(parseDriverVehicleYear(' 2022 ')).toBe(2022);
    expect(parseOptionalDriverVehicleYear('2021')).toBe(2021);
  });

  it('falls back for partial, dirty, or out-of-range vehicle years', () => {
    expect(parseDriverVehicleYear('2024abc')).toBe(2020);
    expect(parseDriverVehicleYear('24')).toBe(2020);
    expect(parseDriverVehicleYear('1989')).toBe(2020);
    expect(parseDriverVehicleYear('2036')).toBe(2020);
    expect(parseDriverVehicleYear(Number.NaN)).toBe(2020);
    expect(parseOptionalDriverVehicleYear('2024abc')).toBeNull();
  });
});
