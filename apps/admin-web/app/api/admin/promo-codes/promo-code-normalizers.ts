import { type CreateAdminPromoCodePayload } from '@orbi/api';

const isoUtcDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

export function normalizePromoCodeDate(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = isoUtcDateTimePattern.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = match[7] ? Number(match[7]) : 0;
  const date = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return date.toISOString();
}

export function normalizePromoCodePayload(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, 200)
      : undefined;

  if (code.length < 3 || code.length > 32) {
    return null;
  }

  if (
    typeof input.discountBps !== 'number' ||
    !Number.isInteger(input.discountBps) ||
    input.discountBps < 1 ||
    input.discountBps > 10000
  ) {
    return null;
  }

  if (
    input.maxUses !== undefined &&
    (typeof input.maxUses !== 'number' ||
      !Number.isInteger(input.maxUses) ||
      input.maxUses < 1 ||
      input.maxUses > 100000)
  ) {
    return null;
  }

  const validFrom = normalizePromoCodeDate(input.validFrom);
  const validTo = normalizePromoCodeDate(input.validTo);

  if (
    !validFrom ||
    !validTo ||
    new Date(validTo).getTime() <= new Date(validFrom).getTime()
  ) {
    return null;
  }

  if (
    input.firstTripOnly !== undefined &&
    typeof input.firstTripOnly !== 'boolean'
  ) {
    return null;
  }

  const payload: CreateAdminPromoCodePayload = {
    code,
    discountBps: input.discountBps,
    validFrom,
    validTo,
    firstTripOnly:
      typeof input.firstTripOnly === 'boolean' ? input.firstTripOnly : true,
  };

  if (description) {
    payload.description = description;
  }

  if (typeof input.maxUses === 'number') {
    payload.maxUses = input.maxUses;
  }

  return payload;
}
