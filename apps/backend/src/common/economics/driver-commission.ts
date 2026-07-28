export const DEFAULT_PLATFORM_COMMISSION_RATE = 0.12;
export const DRIVER_COMMISSION_STEP_XOF = 10;

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
  return DEFAULT_PLATFORM_COMMISSION_RATE;
}

export function roundCommissionForDriverSettlement(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  return (
    Math.floor(Math.floor(amount) / DRIVER_COMMISSION_STEP_XOF) *
    DRIVER_COMMISSION_STEP_XOF
  );
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
  const rawCommissionAmount = Math.floor(grossFare * commissionRate);
  const commissionAmount = roundCommissionForDriverSettlement(rawCommissionAmount);

  return {
    commissionRate,
    commissionAmount,
    driverPayout: grossFare - commissionAmount,
    rawCommissionAmount,
    commissionRoundingDiscount: rawCommissionAmount - commissionAmount,
    settlementRoundingStep: DRIVER_COMMISSION_STEP_XOF,
    driverOnboardingDays,
  };
}
