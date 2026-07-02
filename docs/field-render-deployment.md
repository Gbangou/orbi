# Orbi field backend on Render and Neon

This runbook provisions a real field-test backend with Render for the API, Neon
for Postgres, Prisma migrations, seeded demo accounts, health checks, rate
limiting and realtime backed by the shared database.

## What is real in the field flow

- Rider booking calls the backend and creates a persisted `rideRequest`.
- Driver availability, position, profile approval and active vehicle are required
  before a driver is visible to riders or eligible for dispatch.
- Driver offers are loaded from backend state. A rider request is not a confirmed
  trip until a driver accepts and the backend creates the trip.
- Mobile APKs must point to the same public backend URL through
  `EXPO_PUBLIC_API_BASE_URL`.

## Render and Neon deployment

The repository includes `render.yaml` as a Render Blueprint:

- `orbi-field-api`: NestJS backend.
- `DATABASE_URL`: external Neon Postgres connection string entered as a Render
  secret.
- `buildCommand`: installs pnpm, builds packages, runs `prisma migrate deploy`
  and runs the idempotent seed.
- `/api/v1/health/ready`: health check used by Render.

The default Blueprint is configured for a no-card field test:

- Web service plan: Render Free.
- Database: Neon Postgres, provided through `DATABASE_URL`.
- Driver document object path: `/tmp/orbi-documents`.

This is enough to prove that rider and driver communicate through a real server
and that operational records are persisted in Neon Postgres. It is not
production: the free web service can sleep, free database tiers have lifecycle
and usage limits, and document objects stored under `/tmp` are ephemeral. Do not
use this mode for final driver document verification.

Steps:

1. Create a Neon project and a database named `orbi`.
2. Copy the pooled Postgres connection string from Neon, including SSL
   settings.
3. Push this repository to GitHub.
4. In Render, create a new Blueprint from the repository.
5. When Render asks for `DATABASE_URL`, paste the Neon connection string.
6. Review `render.yaml`, then create the web service.
7. Wait for the first deploy, migration and seed to complete.
8. Open `https://orbi-field-api.onrender.com/api/v1/health/ready` and confirm
   the response status is `ready`.

If you rename the service in Render, update these `render.yaml` URLs before the
first deploy:

- `FRONTEND_ALLOWED_ORIGINS`
- `PAYMENTS_DEFAULT_REDIRECT_URL`
- `PAYMENTS_DEFAULT_WEBHOOK_URL`
- `DOCUMENT_UPLOAD_BASE_URL`
- `DOCUMENT_VIEW_BASE_URL`
- `MOBILE_ERROR_COLLECTOR_WEBHOOK_URL`

Before a paid pilot or production launch, upgrade the web service and database
plans, add a persistent disk or object storage provider for driver documents,
and set `DOCUMENT_LOCAL_PROVIDER_ROOT` to the durable storage path, for example
`/var/data/orbi-documents`.

Keep `DATABASE_URL` private. It contains the database username and password and
must never be committed to Git.

## Build APKs against the field server

After Render is live, generate APKs with the Render URL:

```powershell
pnpm mobile:apk:driver -- -ApiBaseUrl https://orbi-field-api.onrender.com
pnpm mobile:apk:rider -- -ApiBaseUrl https://orbi-field-api.onrender.com
```

The output APKs are copied to:

- `dist/orbi-driver-mvp.apk`
- `dist/orbi-rider-mvp.apk`

## Field verification script

1. Install both APKs.
2. Open driver, sign in with the seeded driver account, approve permissions and
   switch to online.
3. Keep driver open long enough to publish GPS presence.
4. Open rider, sign in with the seeded rider account and open booking.
5. Confirm the booking screen shows at least one compatible driver nearby.
6. Create a rider request.
7. Confirm driver sees the offer, accepts it, and rider activity moves from
   request state to active trip state.

If the rider says no driver is nearby, this is expected until the driver is
online, approved, has an active vehicle, and has sent a valid GPS position.
