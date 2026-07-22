# Orbi Field Test Readiness Audit

Date: 2026-06-30

## Scope

This audit covers the rider app, driver app, backend trip lifecycle, shared API
contract, field build configuration and operational test posture.

## Current APK Artifacts

Fresh local Android MVP APKs were generated on 2026-06-30:

| App | Artifact | Size | Generated |
| --- | --- | ---: | --- |
| Rider | `dist/orbi-rider-mvp.apk` | 69,641,502 bytes | 2026-06-30 17:22 |
| Driver | `dist/orbi-driver-mvp.apk` | 69,632,938 bytes | 2026-06-30 17:05 |

The rider APK build blocker was removed by eliminating the native `expo-av`
dependency from the rider voice screen. The voice destination path remains
usable for field testing through deterministic intent capture and backend
location-intent resolution; real speech-to-text remains a production gap.

## Current Field Guarantees

- Rider and driver apps use the deployed field API for the `mvp` and
  `field-test` EAS profiles: `https://orbi-field-api.onrender.com`.
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
- Driver completion remains blocked when Ride Check detects a critical route
  issue.
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

- Use only seeded field accounts or real test accounts connected to the field
  API.
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
  acceptance, pickup arrival, active trip, rating, support and admin live ops.
