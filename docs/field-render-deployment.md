# Orbi field backend on Render

This runbook provisions a real field-test backend with Postgres, Prisma
migrations, seeded demo accounts, health checks, rate limiting and realtime
backed by the shared database.

## What is real in the field flow

- Rider booking calls the backend and creates a persisted `rideRequest`.
- Driver availability, position, profile approval and active vehicle are required
  before a driver is visible to riders or eligible for dispatch.
- Driver offers are loaded from backend state. A rider request is not a confirmed
  trip until a driver accepts and the backend creates the trip.
- Mobile APKs must point to the same public backend URL through
  `EXPO_PUBLIC_API_BASE_URL`.

## Render deployment

The repository includes `render.yaml` as a Render Blueprint:

- `orbi-field-api`: NestJS backend.
- `orbi-field-db`: managed Postgres database.
- `orbi-field-documents`: persistent Render disk mounted at
  `/var/data/orbi-documents` for driver document objects.
- `preDeployCommand`: runs `prisma migrate deploy`.
- `initialDeployHook`: seeds demo accounts once after first deploy.
- `/api/v1/health/ready`: health check used by Render.

Steps:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint from the repository.
3. Review `render.yaml`, then create the web service and database.
4. Wait for the first deploy, migration and seed to complete.
5. Open `https://orbi-field-api.onrender.com/api/v1/health/ready` and confirm
   the response status is `ready`.

If you rename the service in Render, update these `render.yaml` URLs before the
first deploy:

- `FRONTEND_ALLOWED_ORIGINS`
- `PAYMENTS_DEFAULT_REDIRECT_URL`
- `PAYMENTS_DEFAULT_WEBHOOK_URL`
- `DOCUMENT_UPLOAD_BASE_URL`
- `DOCUMENT_VIEW_BASE_URL`
- `MOBILE_ERROR_COLLECTOR_WEBHOOK_URL`

Do not remove the persistent disk. Driver document metadata is stored in
Postgres, and the uploaded document objects are verified against
`DOCUMENT_LOCAL_PROVIDER_ROOT`. Without the mounted disk, document objects would
be tied to ephemeral service storage and would not be acceptable for field use.

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
