const MIN_VEHICLE_YEAR = 1990;
const MAX_VEHICLE_YEAR = 2035;
const FALLBACK_VEHICLE_YEAR = 2020;

export function parseDriverVehicleYear(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return FALLBACK_VEHICLE_YEAR;
  }

  const normalized = String(value).trim();

  if (!/^[0-9]{4}$/.test(normalized)) {
    return FALLBACK_VEHICLE_YEAR;
  }

  const year = Number(normalized);

  return year >= MIN_VEHICLE_YEAR && year <= MAX_VEHICLE_YEAR
    ? year
    : FALLBACK_VEHICLE_YEAR;
}
