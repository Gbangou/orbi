# Mobilis Payment Strategy

## Decision

Mobilis should use an aggregator-first architecture for the MVP, not a direct one-by-one integration with every mobile money operator.

## Why

- Faster MVP delivery
- Fewer direct telecom integrations to maintain
- Easier reconciliation and refunds
- Better expansion path across francophone West Africa
- Cleaner trust and safety model when combined with webhook verification and internal ledgering

## Recommended product architecture

1. Keep cash as fallback in the product.
2. Use one primary payment aggregator for launch.
3. Hide the provider behind a `payments` module and provider abstraction.
4. Persist payment attempts and webhook events; add internal ledger entries
   once settlement and refund rules are ready.
5. Add a second provider only when redundancy or regional coverage really justifies it.

## Current recommendation

- Primary candidate for MVP: Flutterwave
- Secondary / fallback-ready candidate in the architecture: CinetPay

Reasoning:

- Flutterwave officially documents XOF mobile money support for Burkina Faso with Orange Money and Mobicash.
- CinetPay is strong in francophone Africa and fits well as a backup or regional alternative, especially once payout and settlement realities are validated operationally.

## Important implementation rule

The app should never depend directly on one provider's request/response model in the rider or driver flows.

All payment providers must be mediated through:

- `payments.controller.ts`
- `payments.service.ts`
- provider-specific config
- webhook verification
- internal transaction references

Checkout return URLs are also mediated by the backend. A client-provided
`redirectUrl` is accepted only when its origin matches `FRONTEND_ALLOWED_ORIGINS`
or the configured `PAYMENTS_DEFAULT_REDIRECT_URL` origin. This keeps aggregator
return flows from becoming an open redirect while still allowing Expo/local and
production frontend URLs explicitly configured by ops.

## Current webhook contract

Mobilis now keeps two layers of webhook protection:

- a Mobilis shared secret header for local/server-to-server compatibility:
  `x-mobilis-webhook-secret`
- provider verification when configured:
  - Flutterwave: `FLUTTERWAVE_WEBHOOK_SECRET_HASH`, checked against
    `verif-hash` and the newer `flutterwave-signature` HMAC form
  - CinetPay: `CINETPAY_SECRET_KEY`, checked against the documented `x-token`
    HMAC payload

Reconciliation is idempotent by `providerReference` per provider. A repeated
provider reference updates the same attempt as a replay; a provider reference
already bound to another Mobilis `transactionRef` is ignored as a conflict.
Every accepted webhook is stored in `PaymentWebhookEvent` with its action,
reference fields, payload, optional raw-body hash, signature verification marker
and linked payment attempt when reconciliation finds one.
Ops and support can inspect recent stored events through
`GET /api/v1/admin/payment-webhook-events`, with filters for provider, action,
Mobilis transaction reference and provider reference. They can also use the
higher-level `kind` filter: `payment`, `refund` or `ignored`.
`GET /api/v1/admin/payment-webhook-events/:eventId` returns a redacted detail
view for investigation. Sensitive payload fields such as phone numbers, tokens,
secrets and signatures are masked before leaving the backend.
`POST /api/v1/admin/payment-webhook-events/:eventId/investigation` records an
audited investigation start and opens a support ticket when the webhook event is
attached to a known user or payment attempt.
`POST /api/v1/admin/payment-webhook-events/:eventId/replay` replays the stored
payload through the same idempotent reconciliation path. It does not accept a
new payload from the admin surface; it only reprocesses an already journaled
provider notification, writes an audit log, and publishes a realtime admin
signal. This gives ops a controlled pilot tool when a webhook arrived before a
payment attempt could be matched or when a provider reference needs to be
rechecked safely.

When reconciliation marks a payment attempt as `SUCCEEDED`, Mobilis now writes
an internal driver payout ledger entry. The entry credits the driver's XOF
wallet with the fare minus the platform commission, uses
`payment:<paymentAttemptId>:driver-payout` as an idempotent reference, and keeps
gross fare, commission, payout, provider and trip identifiers in metadata.

The admin live ops surface now exposes driver wallets and payout operations:
ops can prepare a payout from the current positive wallet balance, then mark it
paid after the real-world settlement is completed. A prepared payout locks that
wallet against duplicate preparations; marking it paid writes an idempotent
`PAYOUT` ledger transaction and decrements the wallet balance.

Settlement exports are available from the admin payout surface in CSV and PDF.
Both exports are audited and include prepared/paid operator signatures plus the
bounded approval notes stored on the payout.

Ops can also verify a stored `PaymentAttempt` directly with the configured
provider. Flutterwave verification uses the transaction reference endpoint, and
CinetPay verification uses the payment check endpoint. Mobilis validates amount
and currency before reconciling through the same idempotent webhook path.

Refund operations now have an admin-controlled path:
`POST /api/v1/admin/payment-attempts/:paymentAttemptId/refund` records an
idempotent refund request. In local/manual mode, the attempt moves directly to
`REFUNDED` after ops has handled the provider-console action. When
`PAYMENTS_REFUND_MODE=provider`, Mobilis calls the Flutterwave refund endpoint,
stores the provider response in `providerMetadata.refund`, and leaves the
attempt as `REFUND_PENDING` until the provider reports a processed refund.

`POST /api/v1/admin/payment-attempts/:paymentAttemptId/verify-provider` also
acts as the controlled refund-status poller for `REFUND_PENDING` attempts. For
Flutterwave it checks the provider refund id; once the provider marks the
refund processed, Mobilis finalizes the attempt as `REFUNDED`. Only then does
Mobilis write the idempotent `REFUND` wallet transaction using
`payment:<paymentAttemptId>:driver-payout-refund` and decrement the wallet by
the original driver payout amount. CinetPay refunds are deliberately blocked
until a supported refund/status endpoint is configured.

Provider refund webhooks are handled through the same
`POST /api/v1/payments/webhooks` entrypoint. Refund payloads are routed away
from normal payment reconciliation, matched by
`providerMetadata.refund.providerRefundId` or the provider transaction
reference, and journaled as `refund_processed`, `refund_still_pending`,
`ignored_unknown_reference` or `ignored_missing_reference`. A processed refund
webhook finalizes the same idempotent reversal path as provider polling.

Refund webhook fixtures live in
`apps/backend/src/modules/payments/fixtures/`. The current Flutterwave refund
fixtures are executable tests for processed and pending refunds. When sandbox
payloads are captured, add them there first, then update
`payments.service.spec.ts` so every provider payload format proves whether it
does or does not move wallet money.

If the driver payout was already marked paid before the refund, the wallet can
become negative. Admin wallets expose this as `recoveryDue`: the amount Mobilis
must recover or offset before future payouts. Wallets with recovery due are not
payable until the balance becomes positive again.

Ops can record a field recovery through
`POST /api/v1/admin/driver-wallets/:walletId/recovery-adjustments`. The action
requires a positive amount, an ops note and an idempotency key, writes an
`ADJUSTMENT` ledger transaction, increments the wallet balance, publishes an
admin realtime signal and writes an audit log.

## Next engineering step

After this foundation, the next serious payment work should be:

1. capture real Flutterwave sandbox refund webhook payloads and keep them as fixtures
2. connect CinetPay refund automation when the supported endpoint is validated
3. document replay, refund and provider-verification runbooks with screenshots from the
   first sandbox incidents
