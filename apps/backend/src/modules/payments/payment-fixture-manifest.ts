export type PaymentFixtureSourceKind =
  | 'local_policy'
  | 'schema_compliant'
  | 'sandbox_capture';

export type PaymentFixtureMoneyMovement =
  | 'none'
  | 'wallet_credit'
  | 'wallet_refund_reversal';

export type PaymentFixtureExpectation = {
  nextAction:
    | 'refund_processed'
    | 'refund_still_pending'
    | 'persisted_and_reconciled'
    | 'persisted_idempotent_replay'
    | 'ignored_unknown_reference'
    | 'ignored_amount_mismatch'
    | 'ignored_missing_reference';
  moneyMovement: PaymentFixtureMoneyMovement;
  paymentAttemptStatus:
    | 'PENDING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'REFUND_PENDING'
    | 'REFUNDED'
    | null;
};

export type PaymentWebhookFixtureManifestEntry = {
  id: string;
  provider: 'FLUTTERWAVE' | 'CINETPAY';
  fileName: string;
  sourceKind: PaymentFixtureSourceKind;
  capturedAt: string | null;
  eventFamily: 'charge' | 'refund' | 'unknown_reference';
  expected: PaymentFixtureExpectation;
  notes: string;
};

export const paymentWebhookFixtureManifest: PaymentWebhookFixtureManifestEntry[] = [
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
  {
    id: 'flutterwave-charge-completed-schema-compliant',
    provider: 'FLUTTERWAVE',
    fileName: 'flutterwave-charge-completed-webhook.json',
    sourceKind: 'schema_compliant',
    capturedAt: null,
    eventFamily: 'charge',
    expected: {
      nextAction: 'persisted_and_reconciled',
      moneyMovement: 'wallet_credit',
      paymentAttemptStatus: 'SUCCEEDED',
    },
    notes:
      'Schema-compliant Flutterwave charge.completed webhook that reconciles a known transactionRef and must credit the rider wallet. Replace with a sandbox_capture once sandbox credentials are available.',
  },
  {
    id: 'flutterwave-charge-failed-schema-compliant',
    provider: 'FLUTTERWAVE',
    fileName: 'flutterwave-charge-failed-webhook.json',
    sourceKind: 'schema_compliant',
    capturedAt: null,
    eventFamily: 'charge',
    expected: {
      nextAction: 'persisted_and_reconciled',
      moneyMovement: 'none',
      paymentAttemptStatus: 'FAILED',
    },
    notes:
      'Schema-compliant Flutterwave charge.failed webhook that marks an attempt as FAILED without moving any money. Replace with a sandbox_capture once sandbox credentials are available.',
  },
  {
    id: 'flutterwave-unknown-reference-schema-compliant',
    provider: 'FLUTTERWAVE',
    fileName: 'flutterwave-unknown-reference-webhook.json',
    sourceKind: 'schema_compliant',
    capturedAt: null,
    eventFamily: 'unknown_reference',
    expected: {
      nextAction: 'ignored_unknown_reference',
      moneyMovement: 'none',
      paymentAttemptStatus: null,
    },
    notes:
      'Schema-compliant Flutterwave webhook with an unrecognized transactionRef. Must be persisted but must never update a payment attempt or move money. Validates the unknown-reference guard path.',
  },
  {
    id: 'cinetpay-payment-completed-schema-compliant',
    provider: 'CINETPAY',
    fileName: 'cinetpay-payment-completed-webhook.json',
    sourceKind: 'schema_compliant',
    capturedAt: null,
    eventFamily: 'charge',
    expected: {
      nextAction: 'persisted_and_reconciled',
      moneyMovement: 'wallet_credit',
      paymentAttemptStatus: 'SUCCEEDED',
    },
    notes:
      'Schema-compliant CinetPay payment completed callback that reconciles a known cpm_trans_id and must credit the rider wallet. Replace with a sandbox_capture once CinetPay sandbox credentials are available.',
  },
  {
    id: 'cinetpay-payment-failed-schema-compliant',
    provider: 'CINETPAY',
    fileName: 'cinetpay-payment-failed-webhook.json',
    sourceKind: 'schema_compliant',
    capturedAt: null,
    eventFamily: 'charge',
    expected: {
      nextAction: 'persisted_and_reconciled',
      moneyMovement: 'none',
      paymentAttemptStatus: 'FAILED',
    },
    notes:
      'Schema-compliant CinetPay payment failed callback that marks an attempt as FAILED without moving money. Replace with a sandbox_capture once CinetPay sandbox credentials are available.',
  },
] as const satisfies PaymentWebhookFixtureManifestEntry[];

export function resolvePaymentFixtureProductionReadiness(
  entries: readonly PaymentWebhookFixtureManifestEntry[] =
    paymentWebhookFixtureManifest,
) {
  const sandboxCaptures = entries.filter(
    (entry) => entry.sourceKind === 'sandbox_capture',
  ).length;
  const schemaCompliantFixtures = entries.filter(
    (entry) => entry.sourceKind === 'schema_compliant',
  ).length;
  const localPolicyFixtures = entries.filter(
    (entry) => entry.sourceKind === 'local_policy',
  ).length;

  return {
    total: entries.length,
    sandboxCaptures,
    schemaCompliantFixtures,
    localPolicyFixtures,
    isPilotReady: entries.length > 0 && sandboxCaptures > 0,
    summary:
      sandboxCaptures > 0
        ? `${sandboxCaptures}/${entries.length} fixture(s) paiement proviennent de captures sandbox.`
        : `Aucune fixture paiement sandbox capturee: ${schemaCompliantFixtures} fixture(s) schema_compliant couvrent la structure provider mais ne remplacent pas les preuves sandbox reelles avant le pilote.`,
  };
}
