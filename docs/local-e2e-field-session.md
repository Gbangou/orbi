# Orbi Local E2E Field Session

This runbook validates the MVP as a real Burkina Faso field session, not only as a compiling codebase.

## Goal

Prove that one full ride can survive the critical path:

1. rider booking
2. driver acceptance
3. pickup code and trip lifecycle
4. live driver movement toward pickup and destination
5. mobile money checkout and webhook reconciliation
6. admin live ops visibility
7. driver wallet credit
8. payout preparation and settlement
9. refund and wallet reversal

## Start

From the repo root:

```powershell
pnpm db:start
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev:full-web
```

Open:

- Admin web: `http://localhost:3001`
- Rider web: Expo URL from the terminal, usually `http://localhost:8081`
- Driver web: stop rider web, then run `pnpm dev:web-driver-preview`

For phone validation:

```powershell
pnpm mobile:lan
pnpm mobile:check
pnpm dev:full-mobile
```

`pnpm mobile:check` verifies that rider and driver `.env` files point to the
same LAN API URL, reject `localhost` for real phone sessions, and confirms the
backend health endpoint is reachable from that configured URL.

Demo accounts:

- Admin: `admin@orbi.app` / `Orbi123!`
- Rider: `rider@orbi.app` / `Orbi123!`
- Driver: `driver@orbi.app` / `Orbi123!`

## Checklist Command

Run this before a session:

```powershell
pnpm e2e:local-checklist
```

It checks whether backend/admin are reachable and prints the field checklist.

For a backend-only smoke of the same critical money path:

```powershell
pnpm e2e:local-api
```

This command signs in the demo accounts, creates a ride request, accepts and
completes a trip, records driver route positions, verifies pickup/destination
distance progress from both the route-position response and trip detail, creates
a checkout intent, posts a local webhook, verifies wallet credit, prepares and
pays a payout, refunds the payment attempt, and checks the wallet reversal plus
live ops refund counter.

Run it against a freshly seeded local database when possible. The smoke cancels
leftover active trips for the demo driver before starting; if an old ride still
blocks the flow, reseed first with `pnpm prisma:seed`.

For provider webhook fixture regression, especially before a payment/refund
field session:

```powershell
pnpm test:payments:fixtures
```

This keeps the local Flutterwave refund fixtures executable. The `processing`
fixture must journal a pending refund without moving wallet money; the
`completed` fixture must finalize the refund and write the driver wallet
reversal idempotently.

If the backend watch mode is blocked by the local Windows shell, run the backend
without watch for the smoke:

```powershell
pnpm --filter backend start
```

## Critical Path

### 1. Rider Booking

- Sign in as rider.
- Create a `MOBILE_MONEY` motorcycle request.
- Expected: request is created with a clear upfront fare, route summary and active state.
- Admin expected: open request or matched trip appears in live ops.

### 2. Driver Acceptance

- Sign in as driver.
- Set availability to online.
- Update presence if the UI exposes it.
- Accept the rider request.
- Expected: driver sees the active trip, rider sees matched driver, admin sees matched trip.

### 3. Trip Lifecycle

- Advance to driver arriving.
- Record driver route positions before pickup.
- Confirm the route-position response and rider trip detail show the driver
  signal moving closer to pickup.
- Confirm Live Ops shows the driver route progress as pickup/destination
  distances, and does not expose raw coordinates.
- Verify pickup code.
- Start the trip.
- Record another driver route position during the ride.
- Confirm the route-position response and trip detail expose remaining
  destination distance.
- Confirm Live Ops keeps using the driver vehicle signal even if a newer rider
  ping arrives, and flags active trips still waiting for the first driver GPS
  signal.
- Complete the trip.
- Expected: no invalid transition is accepted; admin timeline stays readable.

### 4. Checkout Intent

- Trigger mobile money checkout from the rider flow.
- Capture the returned `transactionRef` and `amount` from UI, API logs, or admin payment journal.
- Expected: one payment attempt exists for the ride request.

### 5. Local Webhook Reconciliation

Post a local success webhook to the backend. Replace placeholders with the checkout values:

```powershell
$body = @{
  event = "payment.completed"
  transactionRef = "<transactionRef>"
  data = @{
    tx_ref = "<transactionRef>"
    providerReference = "local_provider_ref_$(Get-Date -Format yyyyMMddHHmmss)"
    status = "successful"
    amount = <amount>
    currency = "XOF"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/payments/webhooks" `
  -ContentType "application/json" `
  -Headers @{ "x-orbi-webhook-secret" = "orbi_dev_webhook_secret" } `
  -Body $body
```

Expected:

- webhook response is received
- admin webhook journal shows a reconciled event
- payment attempt is `SUCCEEDED`
- provider reference is stored
- replaying the webhook remains idempotent

### 6. Wallet Credit

Open admin wallets and payouts.

Expected:

- driver wallet has a `CREDIT` ledger entry
- transaction reference is `payment:<paymentAttemptId>:driver-payout`
- wallet balance increased by fare minus Orbi commission
- commission metadata is visible in the transaction summary

### 7. Payout Settlement

- Prepare payout.
- Export CSV settlement.
- Export PDF settlement.
- Mark payout paid.

Expected:

- only one prepared payout exists for the wallet
- payout paid creates one `PAYOUT` ledger entry
- wallet balance decreases by payout amount
- live admin feedback is readable

### 8. Refund

From the webhook journal:

- Click refund on the linked payment attempt.
- Click refund again or reload and verify the action is no longer available for `REFUNDED`.

Expected:

- payment attempt becomes `REFUNDED`
- audit log action is `PAYMENT_ATTEMPT_REFUNDED`
- realtime admin signal is published
- provider refund reference is deterministic
- wallet shows `REFUND` reversal with reference `payment:<paymentAttemptId>:driver-payout-refund`
- live ops refunded counter increments

Provider-mode variant:

- Set `PAYMENTS_REFUND_MODE=provider` and `FLUTTERWAVE_SECRET_KEY`.
- After refund request, expect `REFUND_PENDING` if Flutterwave has not processed
  the refund yet.
- Use provider verification or the Flutterwave refund webhook to finalize
  `REFUNDED`; the wallet reversal must appear only after that confirmation.

### 9. Provider Verification, Replay and Investigation

Use this section when a payment or refund is stuck, when a provider callback is
ambiguous, or when an operator needs to prove that replay is idempotent.

1. List recent webhook events:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:3000/api/v1/admin/payment-webhook-events?kind=payment" `
  -Headers @{ Authorization = "Bearer <adminSessionToken>" }
```

Expected:

- event rows are redacted enough for admin use
- `paymentAttemptId` is present for reconciled events
- unknown references remain visible as ignored/orphan events

2. Open one webhook detail:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:3000/api/v1/admin/payment-webhook-events/<eventId>" `
  -Headers @{ Authorization = "Bearer <adminSessionToken>" }
```

Expected:

- raw provider payload is redacted
- linked ride, rider and payment attempt are visible when known
- finance can decide between replay, provider verification or investigation

3. Replay the stored webhook:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/admin/payment-webhook-events/<eventId>/replay" `
  -Headers @{ Authorization = "Bearer <adminSessionToken>" }
```

Expected:

- repeated replay does not duplicate wallet credits, refunds or webhook journal
  effects
- audit log action is `PAYMENT_WEBHOOK_REPLAYED`
- admin realtime signal confirms the replay result

4. Verify a payment attempt with the provider:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/admin/payment-attempts/<paymentAttemptId>/verify-provider" `
  -Headers @{ Authorization = "Bearer <adminSessionToken>" }
```

Expected:

- amount and currency must match the server payment attempt
- provider success reconciles at most one attempt
- `REFUND_PENDING` attempts only move to `REFUNDED` when the provider refund is
  confirmed as processed
- audit log action is `PAYMENT_ATTEMPT_PROVIDER_VERIFIED`

5. Start an investigation when the event cannot be safely reconciled:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/v1/admin/payment-webhook-events/<eventId>/investigation" `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer <adminSessionToken>" } `
  -Body (@{ note = "Reference provider inconnue pendant la session terrain." } | ConvertTo-Json)
```

Expected:

- audit log action is `PAYMENT_WEBHOOK_INVESTIGATION_STARTED`
- a support ticket is created when a user/payment can be linked
- orphan events stay visible to finance without attaching money movement

## Failure Log

During the session, record every issue here before fixing it:

| Time | Surface | Step | Expected | Actual | Severity | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

Severity:

- `P0`: money, auth or safety invariant broken
- `P1`: critical journey blocked
- `P2`: confusing but recoverable UX/API behavior
- `P3`: polish or copy

## Exit Criteria

The session passes only if:

- no duplicate money movement is possible through retry, replay or double click
- rider, driver and admin all show the same lifecycle truth
- every money mutation is visible in admin
- webhook replay and refund remain idempotent
- refresh/reopen does not lose the critical state
- any failed provider/webhook action gives an operator-readable message
