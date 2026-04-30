# Mobilis Agent Guide

## Mission

Mobilis is a Burkina Faso mobility platform for riders, drivers, operations and
support. The system optimizes for safe local transport, clear pricing, reliable
dispatch, mobile money readiness and operational trust.

## Mental Model

- `apps/backend`: NestJS API, Prisma schema, auth, dispatch, trips, payments,
  admin, health and runtime safeguards.
- `apps/admin-web`: Next.js operations console for live ops, onboarding,
  pricing, support, health, dispatch and payment investigations.
- `apps/rider-app`: Expo rider app for auth, booking, payment, voice and active
  ride flow.
- `apps/driver-app`: Expo driver app for onboarding, availability, offers and
  active trip flow.
- `packages/api`: typed client contract shared by apps.
- `packages/domain`: canonical domain enums and shared Burkina pricing presets.
- `docs`: architecture, strategy, runbooks and product truth. Keep docs aligned
  when behavior changes.

## Execution Rules

1. Preserve domain invariants before adding features.
2. Prefer shared contracts in `packages/domain` and `packages/api` over local
   duplicate types.
3. Validate and bound all external input. Structured fields reject dirty data;
   free-text fields stay bounded and are rendered as inert text.
4. Money flows must be idempotent, auditable and visible to admin ops.
5. Realtime-facing changes must preserve degraded-mode behavior.
6. Admin actions that affect operations, trust or money must write audit logs.
7. Every meaningful change gets focused tests and, when applicable, doc updates.
8. Run at least targeted tests plus `pnpm typecheck` before considering work
   complete.

## Standard Verification

- Backend focused: `pnpm --filter backend test -- <pattern> --runInBand`
- Backend full: `pnpm --filter backend test -- --runInBand`
- Prisma: `pnpm --filter backend exec prisma validate`
- Full workspace: `pnpm typecheck`
- Mobile smoke when rider/driver UI changes: `pnpm test:mobile:smoke`
