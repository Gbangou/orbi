# Orbi Professional App Audit

Date: 2026-06-30

## Executive Verdict

Orbi is not a throwaway prototype. The repo is organized like a serious
multi-surface mobility platform: NestJS backend, Prisma domain model, Next.js
admin ops console, Expo rider and driver apps, shared API contracts and shared
domain primitives.

The app is field-testable after this pass: fresh Android APKs exist for rider
and driver, dependency drift has been reduced, and the local build script is
more reproducible.

It is not yet truly at Uber, Yango, Lyft or Bolt maturity. Those products have
years of live marketplace data, fraud teams, safety operations, fleet processes,
payment provider history, observability, rollout systems and incident response.
Orbi can compete locally if it keeps its advantage: Burkina-first pricing,
mobile money readiness, visible safety and strong admin operations.

## Codebase Size

Tracked relevant source measured before APK generation, excluding generated and
dependency folders:

| Area | Lines |
| --- | ---: |
| `apps/backend` | 61,180 |
| `apps/admin-web` | 17,579 |
| `apps/rider-app` | 14,649 |
| `apps/driver-app` | 11,882 |
| `packages/api` | 4,446 |
| Total measured relevant code | 121,043 |

## APK Status

| App | Artifact | Size | Generated |
| --- | --- | ---: | --- |
| Rider | `dist/orbi-rider-mvp.apk` | 69,641,502 bytes | 2026-06-30 17:22 |
| Driver | `dist/orbi-driver-mvp.apk` | 69,632,938 bytes | 2026-06-30 17:05 |

## Architecture Assessment

| Dimension | Assessment | Notes |
| --- | --- | --- |
| Modular backend | Strong | Domain modules exist for auth, drivers, trips, ride requests, payments, admin, health, notifications, pricing, voice, scheduled rides and observability. |
| Shared contracts | Strong | `packages/api` and `packages/domain` reduce local duplicate types and align mobile/admin/backend behavior. |
| Mobile structure | Good | Rider and driver apps split screens from reusable domain helpers, realtime hooks, storage, safety and reporting helpers. |
| Admin ops | Strong but dense | The admin surface covers live ops, onboarding, pricing, support, health, payments and audits. `admin.service.ts` is large and should be split by use case as scale grows. |
| Testing posture | Good | Backend, admin and mobile smoke/unit tests exist across critical flows. Real-device, load, chaos and provider-contract tests remain necessary. |
| Maintainability | Good | Code reads like an experienced team built it, with clear boundaries and invariants. Remaining risk is service size, production provider integration and operational calibration. |

## Leader Parity Matrix

| Capability | Orbi status | Gap to leaders |
| --- | --- | --- |
| Upfront price | Present | Needs field calibration from real conversion, cancellation and payout data. |
| Dispatch and matching | Present | Needs scale testing, geospatial tuning, load behavior and fairness calibration. |
| Rider safety | Present | Needs real emergency playbook, support SLA, trusted-contact field validation and anomaly tuning. |
| Driver verification | Present | Needs real object storage provider, periodic re-screening, selfie/live checks and ops SLA. |
| Pickup code | Strong | Good parity signal; keep mandatory for sensitive trips. |
| Payments | Good foundation | Needs live provider reconciliation drills, finance dashboards and zero-double-debit evidence. |
| Realtime | Good foundation | Needs multi-instance field exercise, replay/resume and external alerting. |
| Support | Present | Needs 24/7 operating model, SLA metrics and escalation doctrine. |
| Mobile observability | Present | Needs crash-free sessions, external crash tooling and privacy-reviewed dashboards. |
| Voice/search | Degraded field mode | Native audio build blocker removed; real STT remains future work. |

## Fixes Applied In This Pass

- Removed the rider app native `expo-av` dependency that blocked Android release
  builds on Windows CMake/Ninja.
- Kept the rider voice destination flow usable through deterministic field-mode
  intent capture and backend voice-location intent resolution.
- Aligned Expo native dependencies for rider and driver with SDK 52 expected
  versions.
- Generated fresh rider and driver APKs for field testing.
- Hardened `scripts/build-apk-local.ps1` with CI mode, production env,
  telemetry disablement and Gradle JVM tuning after each clean Expo prebuild.

## Critical Remaining Risks

1. Real-world safety operations are not solved by code alone. SOS, incidents,
   trusted contacts and Ride Check need a staffed escalation process.
2. Voice is not real STT yet. The current field path preserves UX and backend
   NLP testing, but production parity needs a server-side or native STT plan.
3. Payment maturity requires repeated live-provider drills with failed,
   delayed, duplicated and refunded payments.
4. Admin service density should be reduced before the next major feature wave.
5. Production-grade leadership parity requires external observability:
   tracing, metrics, alerting, crash-free sessions and capacity dashboards.
6. Pricing and dispatch need Burkina field data. Without local data, any
   "world-class" score is theoretical.

## Professional Recommendation

Use the current APKs for a serious controlled field test, not a public launch.
Run rider + driver + admin together, record each incident, and feed the results
back into pricing, dispatch, support, payments and safety thresholds.

The next highest-value engineering work is:

1. real STT or remove the voice promise from production positioning;
2. split admin money/onboarding/support use cases out of the large admin service;
3. run multi-instance realtime and rate-limit drills;
4. add provider-contract tests for payment edge cases;
5. connect mobile crash reporting to operational dashboards.
