# Field data architecture

Orbi field data must be stored server-side. Mobile apps keep only session state,
runtime configuration and short-lived UI state. Operational truth is the backend
Postgres database plus the configured server-side document object store.

## Source of truth

- Database: managed PostgreSQL through Prisma.
- Schema: `apps/backend/prisma/schema.prisma`.
- Deployment: Render Blueprint `render.yaml` provisions `orbi-field-db`.
- Migrations: `pnpm --filter backend exec prisma migrate deploy`.
- Initial field data: `pnpm --filter backend prisma:seed`.

## Core tables

| Domain | Tables | Purpose |
| --- | --- | --- |
| Identity | `users`, `auth_sessions` | Accounts, roles, sessions and login safety. |
| Rider | `rider_profiles`, `saved_places` | Rider profile, trusted data and saved coordinates. |
| Driver | `driver_profiles`, `vehicles`, `driver_documents`, `driver_onboarding_reviews` | Driver eligibility, active vehicle, document metadata and review trail. |
| Dispatch | `ride_requests`, `job_queue_entries`, `notifications` | Rider demand, async work, push/local notification queue. |
| Trips | `trips`, `trip_events`, `ratings` | Accepted ride lifecycle, route/safety timeline, ratings. |
| Money | `payment_attempts`, `payment_webhook_events`, `wallets`, `wallet_transactions`, `wallet_top_ups`, `driver_payouts` | Checkout, webhook reconciliation, balances, wallet ledger and payouts. |
| Support and audit | `support_tickets`, `audit_logs`, `system_settings` | Ops actions, investigations, support cases and admin traceability. |

## Field booking truth

1. Driver must be approved, online, have an active vehicle and publish GPS
   presence.
2. Rider app calls `/drivers/nearby` before immediate booking.
3. If no compatible online driver is nearby, the rider app blocks immediate
   booking.
4. If a request is created, it is persisted in `ride_requests`.
5. Driver offer polling/realtime reads server state. Nothing is invented by the
   mobile frontend.
6. A ride becomes a real trip only when the driver accepts and the backend
   creates `trips` plus `trip_events`.

## Document storage

Driver document metadata is stored in `driver_documents`. The object itself is
stored under `DOCUMENT_LOCAL_PROVIDER_ROOT` on the server. On Render, this path
is backed by the persistent disk `orbi-field-documents` mounted at
`/var/data/orbi-documents`.

For a larger production launch, replace the local provider with a dedicated
object storage provider, then keep the same metadata and verification contract in
Postgres.

## Operational checks

- Health: `GET /api/v1/health/ready`.
- Nearby drivers: `GET /api/v1/drivers/nearby?lat=12.3647&lng=-1.5332`.
- Rider state: authenticated `/api/v1/trips/mine`.
- Driver offers: authenticated driver offers screen/API.
- Admin truth: support, payments, onboarding, audit logs and health panels read
  the same server database.
