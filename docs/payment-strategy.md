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
Mobilis transaction reference and provider reference.
`GET /api/v1/admin/payment-webhook-events/:eventId` returns a redacted detail
view for investigation. Sensitive payload fields such as phone numbers, tokens,
secrets and signatures are masked before leaving the backend.
`POST /api/v1/admin/payment-webhook-events/:eventId/investigation` records an
audited investigation start and opens a support ticket when the webhook event is
attached to a known user or payment attempt.

## Next engineering step

After this foundation, the next serious payment work should be:

1. add provider-specific API adapters for status verification and refunds
2. add settlement/ledger entries after successful reconciliation
3. harden provider-specific webhook fixtures with real sandbox payloads
4. add replay tooling for stored webhook events
5. add settlement/ledger entries after successful reconciliation
