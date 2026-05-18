# Orbi Production Readiness Directive

## Truth Check

Orbi is not AI slop in its current shape. It has a monorepo, typed API
contracts, backend modules, Prisma migrations, mobile apps, admin ops, realtime
abstractions, rate limiting, payments, docs and tests.

It is also not finished. A product that wants to serve thousands of people still
needs proof outside the repo:

- riders who repeatedly book real trips
- drivers who complete trips without operational hand-holding
- support workflows tested under messy incidents
- payment provider sandbox and live payload fixtures
- field validation on pricing, pickup wait, acceptance and cancellation
- a documented acquisition loop

## Production Timing

As of 1 May 2026, the local MVP backend/admin money path is testable. The local
API smoke covers demo login, rider booking, driver acceptance, completed trip,
mobile money checkout, webhook reconciliation, driver wallet credit, payout,
refund, recovery adjustment and live ops counters.

The realistic launch window is:

- Local MVP testing: now
- Controlled field beta: 1 to 2 weeks after real-device rider/driver testing
  and Flutterwave sandbox refund fixtures pass repeatedly
- First production pilot: 4 to 6 weeks after observability, secrets, rollback,
  provider live credentials, incident runbooks and CI money-path smoke are green

Do not treat "production" as a binary deploy. The right first production shape is
a controlled pilot in one Ouagadougou zone with manual ops backup, a capped rider
and driver cohort, and a daily money reconciliation ritual.

## Readiness Snapshot - 15 May 2026

The repo is in local MVP verification, not broad production.

- Local MVP: ready for repeatable local and LAN testing now, provided
  `pnpm e2e:local-api`, `pnpm test:mobile:smoke`, `pnpm test:admin:smoke`,
  `pnpm test:production:gate`, Prisma validation, dependency audit and
  `pnpm typecheck` stay green.
- Controlled field beta: earliest realistic window is 22 May 2026 to
  29 May 2026 if real-device rider/driver sessions and Flutterwave sandbox
  payment/refund webhook fixtures pass repeatedly starting now.
- First production pilot: earliest realistic window is 12 June 2026 to
  26 June 2026 if observability, secrets, rollback, provider live credentials,
  incident runbooks, CI money-path smoke and launch-readiness gates are green
  before the clock starts.
- Broad production: no calendar date yet. It requires signed evidence for the
  launch gates in `docs/security-test-program.md`, including real-device mobile
  validation, external pentest, resilience/chaos, cloud/SOC and legal/privacy.

If any blocking launch-readiness check returns to red, the calendar resets from
the day that check is corrected and verified.

## Full-Stack Production Reality Map

The repo already treats production as more than frontend plus backend, but some
layers are implemented locally while others still need external infrastructure
proof before broad launch.

| Layer | Current coverage | Production gate |
| --- | --- | --- |
| Frontend | Admin Next.js plus Expo rider/driver flows, typed contracts, loading/error states and mobile smoke tests. | Real-device rider/driver sessions and accessibility/performance passes. |
| API and backend logic | NestJS modules for auth, dispatch, trips, payments, wallet, admin, support, health and mobile observability. Business invariants live in services, Prisma constraints and shared domain/API packages. | Full backend suite plus local API money-path smoke in CI. |
| Database and storage | PostgreSQL schema, migrations, partial unique indexes, audit logs, durable job queue and local document object verification. | Managed PostgreSQL backups/restore drill and S3/GCS-compatible document storage. |
| Auth and permissions | Session tokens, password hashing, RBAC, profile scoping, admin HttpOnly session routes and CSRF gate for local admin mutations. | MFA/admin hardening and external security review before broad launch. |
| Hosting and deployment | Runbooks define live/ready probes, rolling deploys and draining semantics. | At least two backend instances behind a load balancer using `/health/ready`. |
| Cloud and compute | Production startup guards reject unsafe public config; strict adapters can fail readiness when shared runtime dependencies are missing. | Cloud provider, secrets manager, backups, rollback and capacity limits configured. |
| CI/CD and version control | Monorepo scripts cover typecheck, Prisma validation, smoke tests and audit. GitHub `main` is the source branch, and the `Production Readiness Gate` workflow runs the cross-platform `pnpm test:production:gate` proof on PRs and `main`. | Required branch protection on that gate for every merge and release tag discipline. |
| Security and RLS-equivalent controls | DTO validation, dirty-data tests, RBAC, profile scoping, no raw SQL path, headers, CORS allow-list, audit logs and SCA overrides. | Pentest, MASVS mobile checks, privacy/retention process and legal review. |
| Rate limiting | Configurable rate-limit guard with in-memory dev mode and PostgreSQL shared backplane for multi-instance. | `RATE_LIMIT_ADAPTER=postgres` and `RATE_LIMIT_STRICT=true` in preprod/prod. |
| Caching and CDN | Browser cache is disabled on auth/admin/payment-sensitive responses; public CDN strategy is not a core dependency yet. | CDN only for safe static assets, with no sensitive API caching. |
| Load balancing and scaling | Readiness/liveness endpoints, graceful shutdown, PostgreSQL realtime/rate-limit backplanes and runbook instructions for multi-instance rollout. | Load balancer routes only ready instances; chaos test instance drain/restart. |
| Error tracking and logs | Mobile `MOB-*` classification, sanitized local queues, backend `/mobile/error-reports`, webhook collector boundary, critical audit/support ticket creation and Nest worker logging. | Configure the HTTPS collector endpoint, alert routing and retention policy before production. |

## Non-Negotiable Build Rules

1. No feature ships without a clear invariant, API contract and owner surface.
2. Every external input must pass dirty-data tests.
3. Every money operation must be idempotent, auditable and visible to ops.
4. Every admin action touching trust, payment or dispatch must write audit logs.
5. Every production assumption must be represented in a doc, migration, test or
   runbook.
6. Do not optimize for more screens before validating repeated real usage.

## Dirty Data Gate

Before deployment, run:

```bash
pnpm --filter backend test -- dirty-input-validation --runInBand
pnpm --filter backend test -- --runInBand
pnpm typecheck
```

Required dirty cases:

- emojis in structured identity fields
- HTML and script strings in free-text fields
- invalid emails and phone numbers
- null, empty and unknown fields
- oversized strings
- invalid dates
- invalid MIME types
- malformed provider webhook references
- realistic Burkina names, phone numbers, plates and documents

## Validation And Customer Acquisition

The market signal is plausible, not proven. Burkina transport already has local
alternatives and informal behavior. Mobile money growth is favorable, but it
does not prove riders will switch or drivers will trust the platform.

Run validation in phases:

1. Recruit 20 riders and 10 drivers in one Ouagadougou zone.
2. Complete 50 real or supervised trips with manual ops backup.
3. Measure acceptance rate, pickup wait, cancellation, price objections and
   payment success.
4. Interview riders after the second trip, not just after signup.
5. Interview drivers after cash-out or payment reconciliation.
6. Keep only channels that create repeated rides, not vanity installs.

Initial acquisition channels:

- campus and work commute corridors
- driver ambassador referrals
- WhatsApp neighborhood groups
- local business delivery/transport partnerships
- airport/hotel controlled pilots
- content showing real pickup time, price clarity and driver verification

## Current Priority Order

1. Run real-device rider and driver MVP sessions on the same Wi-Fi/LAN setup.
2. Capture Flutterwave sandbox payment and refund webhooks as fixtures.
   `/health.operations.productionReadiness` exposes this as
   `payment-provider-evidence`; without at least one sandbox capture, production
   remains blocked on provider evidence instead of relying on local policy
   fixtures.
3. Harden input validation and dirty-data tests.
4. Add observability dashboards for latency, failures, conversion and support.
5. Keep `/health.operations.serviceLevelObjectives` green or explicitly
   acknowledged as a limited-pilot risk before every field session.
6. Keep `admin/launch-readiness.fieldQuality` at `excellent` for broad launch,
   or `watch` only for a capped field pilot with named owners.
7. Keep mobile rider/driver errors classified with the shared `MOB-*`
   taxonomy before adding new client-side flows, and queue reportable mobile
   errors locally with sanitized context. The apps now drain those reports to
   `/mobile/error-reports`; critical reports write audit logs and open support
   tickets. Before production, `/health.operations.productionReadiness` must
   show the mobile error collector check as passing with an external HTTPS
   collector endpoint.
8. Validate one real pilot zone before expanding UI scope.
9. Keep CI green with Prisma migrations plus the local API money-path smoke.
