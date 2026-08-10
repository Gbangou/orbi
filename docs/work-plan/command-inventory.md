# Orbi Command Inventory

Date: 2026-08-10

## Package Manager

- Manager: `pnpm`
- Declared version: `pnpm@10.30.0`
- Observed version: `10.30.0`
- Node requirement: `>=22`
- Observed Node: `v24.16.0`
- Workspace file: `pnpm-workspace.yaml`

Workspace globs:

- `apps/*`
- `packages/*`

## Applications Detected

- `apps/backend`: NestJS API, Prisma, Jest, ESLint, PostgreSQL.
- `apps/admin-web`: Next.js admin console, Jest smoke tests, ESLint.
- `apps/rider-app`: Expo / React Native rider app, Jest smoke tests, TypeScript lint/typecheck.
- `apps/driver-app`: Expo / React Native driver app, Jest smoke tests, TypeScript lint/typecheck.

## Packages Detected

- `packages/api`: shared typed API contract.
- `packages/config`: shared configuration helpers.
- `packages/domain`: shared domain enums and pricing/domain invariants.
- `packages/i18n`: shared translations/setup.
- `packages/ui`: shared UI tokens/components for web/native use.

## Root Scripts

- Install/setup: `pnpm setup:local`
- Mobile LAN configuration: `pnpm mobile:lan`
- Mobile field readiness: `pnpm mobile:check`
- Mobile brand assets: `pnpm mobile:brand-assets`
- APK builds: `pnpm mobile:apk`, `pnpm mobile:apk:rider`, `pnpm mobile:apk:driver`
- Field APK builds: `pnpm mobile:apk:rider:field`, `pnpm mobile:apk:driver:field`
- EAS field build: `pnpm mobile:field`
- Field API check: `pnpm field:api:check`
- Local doctor: `pnpm local:doctor`
- Free local ports: `pnpm local:ports:free`
- Local database: `pnpm db:start`
- Dev backend: `pnpm dev:backend`
- Dev admin: `pnpm dev:admin`
- Dev rider native: `pnpm dev:rider`
- Dev driver native: `pnpm dev:driver`
- Dev rider web: `pnpm dev:rider:web`
- Dev driver web: `pnpm dev:driver:web`
- Dev stacks: `pnpm dev:stack`, `pnpm dev:web-preview`, `pnpm dev:web-driver-preview`, `pnpm dev:full-web`, `pnpm dev:full-mobile`
- Android MVP builds: `pnpm build:android:rider:mvp`, `pnpm build:android:driver:mvp`
- Workspace build: `pnpm build`
- Workspace lint: `pnpm lint`
- Workspace typecheck: `pnpm typecheck`
- Admin smoke tests: `pnpm test:admin:smoke`
- Mobile helper tests: `pnpm test:mobile:helpers`
- Mobile smoke tests: `pnpm test:mobile:smoke`
- Payment fixture test: `pnpm test:payments:fixtures`
- Security local gate: `pnpm test:security:local`
- Security source audit: `pnpm test:security:source`
- Production gate: `pnpm test:production:gate`
- Demo/e2e local scripts: `pnpm demo:local-live-session`, `pnpm e2e:local-checklist`, `pnpm e2e:local-api`
- Backend tests: `pnpm test`
- Backend e2e tests: `pnpm test:e2e`
- Prisma generate: `pnpm prisma:generate`
- Prisma deploy migrations: `pnpm prisma:migrate`
- Prisma dev migrations: `pnpm prisma:migrate:dev`
- Prisma seed: `pnpm prisma:seed`

## Backend Scripts

- `pnpm --filter backend build`
- `pnpm --filter backend format`
- `pnpm --filter backend start`
- `pnpm --filter backend start:dev`
- `pnpm --filter backend start:debug`
- `pnpm --filter backend start:prod`
- `pnpm --filter backend lint`
- `pnpm --filter backend test`
- `pnpm --filter backend test:watch`
- `pnpm --filter backend test:cov`
- `pnpm --filter backend test:debug`
- `pnpm --filter backend test:e2e`
- `pnpm --filter backend prisma:generate`
- `pnpm --filter backend prisma:migrate`
- `pnpm --filter backend prisma:migrate:dev`
- `pnpm --filter backend prisma:seed`

Backend lint warning: `pnpm --filter backend lint` includes `--fix`, so it is not a read-only baseline command.

## Admin Web Scripts

- `pnpm --filter @orbi/admin-web dev`
- `pnpm --filter @orbi/admin-web build`
- `pnpm --filter @orbi/admin-web start`
- `pnpm --filter @orbi/admin-web lint`
- `pnpm --filter @orbi/admin-web typecheck`
- `pnpm --filter @orbi/admin-web test:smoke`

## Rider App Scripts

- `pnpm --filter @orbi/rider-app start`
- `pnpm --filter @orbi/rider-app android`
- `pnpm --filter @orbi/rider-app ios`
- `pnpm --filter @orbi/rider-app web`
- `pnpm --filter @orbi/rider-app test:smoke`
- `pnpm --filter @orbi/rider-app typecheck`
- `pnpm --filter @orbi/rider-app build`
- `pnpm --filter @orbi/rider-app build:android:preview`
- `pnpm --filter @orbi/rider-app build:android:mvp`
- `pnpm --filter @orbi/rider-app build:android:production`
- `pnpm --filter @orbi/rider-app lint`

## Driver App Scripts

- `pnpm --filter @orbi/driver-app start`
- `pnpm --filter @orbi/driver-app android`
- `pnpm --filter @orbi/driver-app ios`
- `pnpm --filter @orbi/driver-app web`
- `pnpm --filter @orbi/driver-app test:smoke`
- `pnpm --filter @orbi/driver-app typecheck`
- `pnpm --filter @orbi/driver-app build`
- `pnpm --filter @orbi/driver-app build:android:preview`
- `pnpm --filter @orbi/driver-app build:android:mvp`
- `pnpm --filter @orbi/driver-app build:android:production`
- `pnpm --filter @orbi/driver-app lint`

## Shared Package Scripts

- `pnpm --filter @orbi/api build`
- `pnpm --filter @orbi/api lint`
- `pnpm --filter @orbi/config build`
- `pnpm --filter @orbi/config lint`
- `pnpm --filter @orbi/domain build`
- `pnpm --filter @orbi/domain typecheck`
- `pnpm --filter @orbi/ui build`
- `pnpm --filter @orbi/ui lint`

`@orbi/i18n` has no scripts declared.

## Prisma

- Schema: `apps/backend/prisma/schema.prisma`
- Prisma config: `apps/backend/prisma.config.ts`
- Migrations directory: `apps/backend/prisma/migrations`
- Seed files:
  - `apps/backend/prisma/seed.ts`
  - `apps/backend/prisma/seed-demo-activity.ts`
  - `apps/backend/prisma/unseed-demo-activity.ts`

Observed migrations include initial schema, payment idempotency, dispatch settings, ride request flow, pricing geography, wallet transactions, driver payouts, job queues, rate limits, support/admin features, PawaPay, phone OTP, scheduled rides, trusted contacts, wallet provider, and driver location freshness.

## Tests

- Backend unit/integration: Jest via `pnpm --filter backend test -- --runInBand`
- Backend e2e: Jest via `pnpm --filter backend test:e2e`
- Admin smoke: Jest via `pnpm test:admin:smoke`
- Mobile smoke: Jest via `pnpm test:mobile:smoke`
- Mobile helper compile: `pnpm test:mobile:helpers`
- Security gates: `pnpm test:security:local`, `pnpm test:security:source`
- Production gate: `pnpm test:production:gate`
- Field/local e2e scripts under `scripts/testing`

## Builds

- Workspace: `pnpm build`
- Backend: `pnpm --filter backend build`
- Admin: `pnpm --filter @orbi/admin-web build`
- Shared packages: `pnpm --filter @orbi/domain build`, `pnpm --filter @orbi/api build`, `pnpm --filter @orbi/config build`, `pnpm --filter @orbi/ui build`
- Rider/driver package `build` scripts only print that Expo application services handle app builds.
- Android/EAS scripts exist for preview, MVP, production, and field profiles.

## External Services

Detected through examples and compose files:

- PostgreSQL local database on `localhost:5433`.
- Optional Redis URLs for rate limit and realtime adapters.
- PawaPay mobile money configuration, default sandbox environment.
- Flutterwave configuration placeholders.
- CinetPay configuration placeholders.
- Expo/EAS for mobile builds.
- Document object storage provider placeholders.
- Public field API endpoint references for deployed field checks.

## Commands To Treat As Dangerous

- Root or backend Prisma migrate/seed commands without environment confirmation.
- Field API and field APK commands that target deployed endpoints.
- EAS build commands that submit remote builds.
- `pnpm local:ports:free`, because it may stop processes.
- `docker compose down -v`, because it removes local volumes.
- Backend `lint` and root `lint`, because backend lint uses `--fix` and can rewrite files.
