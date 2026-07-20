export const DEFAULT_PLATFORM_COMMISSION_RATE = 0.18;

export function resolveDriverOnboardingDays(
  createdAt?: Date | string | null,
  now = new Date(),
) {
  if (!createdAt) return undefined;

  const createdAtMs =
    createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();

  if (!Number.isFinite(createdAtMs)) return undefined;

  return Math.max(0, Math.floor((now.getTime() - createdAtMs) / 86_400_000));
}

export function resolveDriverCommissionRate(driverOnboardingDays?: number) {
  if (driverOnboardingDays === undefined) return DEFAULT_PLATFORM_COMMISSION_RATE;
  if (driverOnboardingDays <= 30) return 0.10;
  if (driverOnboardingDays <= 90) return 0.15;
  return DEFAULT_PLATFORM_COMMISSION_RATE;
}

export function calculateDriverEconomics(
  grossFare: number,
  input: {
    driverOnboardingDays?: number;
    driverCreatedAt?: Date | string | null;
  } = {},
) {
  const driverOnboardingDays =
    input.driverOnboardingDays ??
    resolveDriverOnboardingDays(input.driverCreatedAt);
  const commissionRate = resolveDriverCommissionRate(driverOnboardingDays);
  const commissionAmount = Math.round(grossFare * commissionRate);

  return {
    commissionRate,
    commissionAmount,
    driverPayout: grossFare - commissionAmount,
    driverOnboardingDays,
  };
}
