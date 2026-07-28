# Orbi Field Test Readiness Audit

Date: 2026-07-26

## Scope

This audit covers the rider app, driver app, backend trip lifecycle, shared API
contract, field build configuration and operational test posture.

## Current APK Artifacts

No APK was regenerated during the 2026-07-26 correction pass. The next APK
generation must be done only after `pnpm field:api:check`, `pnpm mobile:check`,
`pnpm typecheck`, backend tests and mobile smoke tests pass.

The local APK script now writes a JSON proof file beside each APK with package,
version, `versionCode`, API target, build time, size and SHA256. Demo account
affordances are disabled by default; enabling them requires an explicit
`-EnableDemoAccounts` switch for internal QA only.

## Current Field Guarantees

- Rider and driver apps use the deployed field API for the `mvp` and
  `field-test` EAS profiles: `https://orbi-field-api.onrender.com`.
- Local mobile `.env` files pointing to the public field API must keep
  `EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS=false` and must not embed public demo
  credentials. `pnpm mobile:check` now enforces this.
- `/api/v1/health/ready` now requires both lifecycle readiness and healthy
  critical dependencies. A degraded database, strict rate-limit, strict
  realtime or reservation-expiry failure blocks field readiness.
- Mobile apps no longer replace live booking or dispatch data with local fake
  ride options or fake driver offers when the API is unavailable.
- A trip starts only after the driver marks pickup arrival and starts the ride
  when the passenger is physically in the vehicle or on the motorcycle.
- The backend requires the driver to mark arrival before moving to `IN_PROGRESS` through the
  generic status endpoint.
- The driver app does not ask for a pickup code in the standard Burkina field
  flow; the backend keeps legacy verification compatibility out of the main UX.
- Backend presenters hide pickup codes for all mobile viewers in trip detail
  and trip history.
- Driver completion is no longer blocked locally by Ride Check. Critical GPS or
  route anomalies are surfaced to the driver and preserved for operations review,
  but the completion request reaches the backend so a real finished trip can
  produce the fare, receipt, payout and audit trail.
- Rider early stop on an `IN_PROGRESS` trip completes the trip and routes the
  rider to the receipt instead of trying to cancel an active ride.
- The pilot pricing policy is active in backend fallbacks and seed data:
  10% driver-founder commission for 30 days, then 12% standard pilot commission;
  Moto starts at `200 + 110/km + 20/min + 50`, minimum `650 XOF`.
- Android generated folders under Expo apps are ignored by Git.

## Architecture Notes

- `packages/domain` remains the canonical source for trip lifecycle states,
  active statuses, pickup verification policy, pricing cities and Burkina
  pricing primitives.
- `packages/api` remains the shared typed client between backend, rider app,
  driver app and admin surfaces.
- Backend trip privacy is enforced in `trips.presenter.ts`, with service-level
  ownership checks in `trips.service.ts`.
- The mobile apps treat realtime as a fast path and polling/refresh as the
  degraded path, preserving field usability during intermittent connectivity.

## Investor Demo Criteria

- Use only operations-provided field accounts or real test accounts connected
  to the field API. Do not use APK builds with visible demo buttons for a
  serious field session.
- Start a rider request from a real phone, accept from a driver phone, mark
  driver arrival, start only after passenger pickup, then complete the trip.
- Demonstrate that the driver sees passenger, vehicle, payout, route and safety
  state, without pickup-code friction in the normal flow.
- Demonstrate that the rider sees driver verification, vehicle, plate, fare,
  route tracking, sharing and SOS controls.
- Keep admin live ops open during the test to show trip lifecycle, driver start
  issued/verified state, incidents and payout visibility.

## Remaining Risks Before Field Test

- Run the full workspace verification after any additional code change:
  `pnpm typecheck`, backend focused tests, Prisma validation and
  `pnpm test:mobile:smoke`.
- Confirm the field backend health immediately before installing or regenerating APKs:
  `pnpm field:api:check` and `pnpm mobile:check`.
- The current local Node used for this pass is `v22.23.1`, aligned with the
  repo engine requirement.
- Install the APKs on real devices with USB, verify login, booking, driver
  acceptance, pickup arrival, active trip, rider early stop, driver completion,
  receipt, rating, support and admin live ops.
