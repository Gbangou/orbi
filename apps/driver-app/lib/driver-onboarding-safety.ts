const MIN_VEHICLE_YEAR = 1990;
const MAX_VEHICLE_YEAR = 2035;
const FALLBACK_VEHICLE_YEAR = 2020;

export function parseOptionalPositiveInteger(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();

  if (!/^[0-9]+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseOptionalDriverVehicleYear(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();

  if (!/^[0-9]{4}$/.test(normalized)) {
    return null;
  }

  const year = Number(normalized);

  return year >= MIN_VEHICLE_YEAR && year <= MAX_VEHICLE_YEAR ? year : null;
}

export function parseDriverVehicleYear(value: unknown) {
  return parseOptionalDriverVehicleYear(value) ?? FALLBACK_VEHICLE_YEAR;
}
