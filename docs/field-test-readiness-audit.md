# Orbi Field Test Readiness Audit

Date: 2026-06-01

## Scope

This audit covers the rider app, driver app, backend trip lifecycle, shared API
contract, field build configuration and operational test posture. APK builds
were intentionally not launched during this pass.

## Current Field Guarantees

- Rider and driver apps use the deployed field API for the `mvp` EAS profile:
  `https://backend-production-d5d1.up.railway.app`.
- Mobile apps no longer replace live booking or dispatch data with local fake
  ride options or fake driver offers when the API is unavailable.
- A trip starts only after the driver enters the 4-digit pickup code supplied
  by the rider.
- The backend blocks direct driver transition to `IN_PROGRESS` through the
  generic status endpoint.
- The driver app asks for the pickup code but does not display the expected
  code, even if a malformed payload contains one.
- Backend presenters hide pickup codes for driver viewers in trip detail and
  trip history. Rider viewers still see the code before departure.
- Pickup-code verification creates an audited lifecycle event without storing
  the plaintext code in the verification event payload.
- Driver completion remains blocked when Ride Check detects a critical route
  issue.
- Android generated folders under Expo apps are ignored by Git.

## Architecture Notes

- `packages/domain` remains the canonical source for trip lifecycle states,
  active statuses, pickup-code visibility states, pricing cities and Burkina
  pricing primitives.
- `packages/api` remains the shared typed client between backend, rider app,
  driver app and admin surfaces.
- Backend trip privacy is enforced in `trips.presenter.ts`, with service-level
  ownership checks in `trips.service.ts`.
- The mobile apps treat realtime as a fast path and polling/refresh as the
  degraded path, preserving field usability during intermittent connectivity.

## Investor Demo Criteria

- Use only seeded field accounts or real test accounts connected to the field
  API.
- Start a rider request from a real phone, accept from a driver phone, verify
  the rider's 4-digit pickup code on the driver phone, then complete only after
  route progress is clean.
- Demonstrate that the driver sees passenger, vehicle, payout, route and safety
  state, but never the expected pickup code.
- Demonstrate that the rider sees driver verification, vehicle, plate, fare,
  pickup code, sharing and SOS controls.
- Keep admin live ops open during the test to show trip lifecycle, pickup-code
  issued/verified state, incidents and payout visibility.

## Remaining Risks Before APK Build

- Run the full workspace verification after any additional code change:
  `pnpm typecheck`, backend focused tests, Prisma validation and
  `pnpm test:mobile:smoke`.
- Confirm the field backend health immediately before building APKs:
  `pnpm field:api:check` and `pnpm mobile:check`.
- The current local Node is `v24.16.0`; the repo targets `>=22 <24`. Commands
  pass with warnings, but APK/release work should use Node 22.
- Do not run `pnpm mobile:apk`, `pnpm mobile:field` or EAS builds until the
  audit gates are green and the user explicitly asks for APK generation.
