export type PaymentFixtureSourceKind = 'local_policy' | 'sandbox_capture';

export type PaymentFixtureMoneyMovement = 'none' | 'wallet_refund_reversal';

export type PaymentFixtureExpectation = {
  nextAction: 'refund_processed' | 'refund_still_pending';
  moneyMovement: PaymentFixtureMoneyMovement;
  paymentAttemptStatus: 'REFUND_PENDING' | 'REFUNDED';
};

export type PaymentWebhookFixtureManifestEntry = {
  id: string;
  provider: 'FLUTTERWAVE' | 'CINETPAY';
  fileName: string;
  sourceKind: PaymentFixtureSourceKind;
  capturedAt: string | null;
  eventFamily: 'refund';
  expected: PaymentFixtureExpectation;
  notes: string;
};

export const paymentWebhookFixtureManifest = [
  {
    id: 'flutterwave-refund-processed-local-policy',
    provider: 'FLUTTERWAVE',
    fileName: 'flutterwave-refund-processed-webhook.json',
    sourceKind: 'local_policy',
    capturedAt: null,
    eventFamily: 'refund',
    expected: {
      nextAction: 'refund_processed',
      moneyMovement: 'wallet_refund_reversal',
      paymentAttemptStatus: 'REFUNDED',
    },
    notes:
      'Local policy fixture that represents a processed Flutterwave refund webhook until a signed sandbox capture replaces or complements it.',
  },
  {
    id: 'flutterwave-refund-pending-local-policy',
    provider: 'FLUTTERWAVE',
    fileName: 'flutterwave-refund-pending-webhook.json',
    sourceKind: 'local_policy',
    capturedAt: null,
    eventFamily: 'refund',
    expected: {
      nextAction: 'refund_still_pending',
      moneyMovement: 'none',
      paymentAttemptStatus: 'REFUND_PENDING',
    },
    notes:
      'Local policy fixture that represents a pending Flutterwave refund webhook and must never move wallet money.',
  },
] as const satisfies PaymentWebhookFixtureManifestEntry[];

export function resolvePaymentFixtureProductionReadiness(
  entries: readonly PaymentWebhookFixtureManifestEntry[] =
    paymentWebhookFixtureManifest,
) {
  const sandboxCaptures = entries.filter(
    (entry) => entry.sourceKind === 'sandbox_capture',
  ).length;
  const localPolicyFixtures = entries.filter(
    (entry) => entry.sourceKind === 'local_policy',
  ).length;

  return {
    total: entries.length,
    sandboxCaptures,
    localPolicyFixtures,
    isPilotReady: entries.length > 0 && sandboxCaptures > 0,
    summary:
      sandboxCaptures > 0
        ? `${sandboxCaptures}/${entries.length} fixture(s) paiement proviennent de captures sandbox.`
        : 'Aucune fixture paiement sandbox capturee: garder le pilote production bloque sur preuve provider.',
  };
}
