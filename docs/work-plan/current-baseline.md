# Current Baseline

Date: 2026-08-10

## Architecture Observed

Orbi is a `pnpm` monorepo with apps and shared packages:

- `apps/backend`: NestJS API, Prisma, PostgreSQL, Jest, ESLint.
- `apps/admin-web`: Next.js operations/admin console.
- `apps/rider-app`: Expo / React Native rider application.
- `apps/driver-app`: Expo / React Native driver application.
- `packages/api`: shared API types/client contract.
- `packages/config`: shared configuration.
- `packages/domain`: shared domain model and invariants.
- `packages/i18n`: shared i18n resources.
- `packages/ui`: shared UI primitives/tokens.

Observed support for:

- mobile money payments and wallet flows,
- PawaPay, Flutterwave, and CinetPay configuration placeholders,
- PostgreSQL,
- optional Redis for realtime/rate limiting,
- realtime transports,
- dispatch, trips, support, health, onboarding, pricing, and admin operations.

## Git State Before Documentation

- Branch: `main`
- Tracking: `origin/main`
- Pre-existing modified files:
  - `apps/rider-app/lib/rider-display-format.ts`
  - `apps/rider-app/test/rider-display-format.test.ts`
- Pre-existing untracked files:
  - `design/logo/orbi-icon.svg`

No app source files were intentionally modified during this safety/baseline step.

## Installation Baseline

Installation was not run because:

- `node_modules` already exists.
- `pnpm-lock.yaml` exists.
- `pnpm --version` reports the declared package manager version, `10.30.0`.

Observed runtime:

- Node: `v24.16.0`
- pnpm: `10.30.0`

PowerShell note: the user profile references `fnm`, which is not available in this shell. Baseline commands were run without loading the profile where appropriate.

## Baseline Results

| Check | Command | Result |
| --- | --- | --- |
| Prisma validation | `pnpm --filter backend exec prisma validate` | Passed |
| Typecheck | `pnpm typecheck` | Passed |
| Backend tests default | `pnpm test` | Failed before tests with `spawn EPERM` from Jest workers |
| Backend tests serial | `pnpm --filter backend test -- --runInBand` | Passed: 94 suites, 1249 tests |
| Admin smoke tests | `pnpm test:admin:smoke` | Passed: 16 suites, 129 tests |
| Mobile smoke tests | `pnpm test:mobile:smoke` | Passed: rider 19 suites/152 tests, driver 22 suites/142 tests |
| Workspace build | `pnpm build` | Passed |
| Admin/packages/mobile lint | filtered non-mutating lint scripts | Passed |
| Backend lint non-mutating | `pnpm --dir apps\backend exec eslint "src/**/*.ts" "test/**/*.ts" "prisma.config.ts"` | Failed: 1009 problems, mostly Prettier |

## Lint Notes

The root `pnpm lint` command was not executed as a baseline command because it delegates to workspace lint scripts, and `apps/backend/package.json` defines:

```json
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" \"prisma.config.ts\" --fix"
```

That command can rewrite source files, which conflicts with the no-modification requirement for this step.

A first attempt to run the backend lint glob without `--fix` using the brace expression produced a Windows/pnpm/minimatch failure. Retrying with explicit globs succeeded in running ESLint and reported existing lint errors.

Backend lint summary:

- 1009 total problems.
- 1002 errors.
- 7 warnings.
- 743 errors potentially fixable with `--fix`.
- Main category: `prettier/prettier`.
- Additional categories include unused variables, unsafe arguments/returns, and object-to-string issues.

## Build Notes

`pnpm build` completed successfully:

- `@orbi/config`: `tsc --noEmit`
- `@orbi/domain`: `tsc -p tsconfig.build.json`
- `backend`: `nest build`
- `@orbi/api`: `tsc --noEmit`
- `@orbi/ui`: `tsc --noEmit`
- `@orbi/admin-web`: `next build`
- `@orbi/driver-app`: prints that Expo application services handle build
- `@orbi/rider-app`: prints that Expo application services handle build

The mobile package build scripts are not local binary/APK builds. Local APK or EAS builds are separate commands and should be treated as heavier operations.

## Services Needed Locally

- PostgreSQL via `apps/backend/docker-compose.yml`, host port `5433`.
- Backend expects `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/orbi?schema=public` in examples.
- Admin expects `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000`.
- Mobile apps expect `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000` for local dev.
- Optional Redis URLs exist for realtime and rate limiting.
- Payment providers require sandbox or provider credentials for real integration checks.

## Safe Commands For Next Work

- `git status --short --branch`
- `pnpm --filter backend exec prisma validate`
- `pnpm typecheck`
- `pnpm --filter backend test -- --runInBand`
- `pnpm test:admin:smoke`
- `pnpm test:mobile:smoke`
- `pnpm build`
- `pnpm --filter @orbi/admin-web lint`
- `pnpm --filter @orbi/rider-app lint`
- `pnpm --filter @orbi/driver-app lint`
- `pnpm --filter @orbi/api lint`
- `pnpm --filter @orbi/config lint`
- `pnpm --filter @orbi/ui lint`

## Dangerous Commands

- `git reset --hard`
- `git clean -fd`
- recursive `Remove-Item` without explicit path verification
- `pnpm prisma:migrate`
- `pnpm prisma:migrate:dev`
- `pnpm prisma:seed`
- `pnpm --filter backend prisma:migrate`
- `pnpm --filter backend prisma:migrate:dev`
- `pnpm --filter backend prisma:seed`
- `pnpm field:api:check`
- `pnpm mobile:field`
- `pnpm mobile:apk:rider:field`
- `pnpm mobile:apk:driver:field`
- EAS build commands without explicit intent
- commands pointed at remote `DATABASE_URL`
- backend/root lint if the goal is read-only, because backend lint includes `--fix`

## Risks

- The backend lint baseline is red and broad. Formatting-only failures are numerous, but there are also real TypeScript lint findings that should not be hidden by a mass formatter pass.
- Root `pnpm test` fails in this environment due to Jest worker spawning; `--runInBand` is required.
- The repository has pre-existing uncommitted rider-display changes and an untracked logo asset. Future edits must not overwrite them accidentally.
- Real payment, wallet, migration, field API, and mobile build commands can touch external systems or submitted builds.
- Local `.env` files exist and must not be documented verbatim.

## Recommendation

Continue with a phased improvement plan:

1. Preserve the current dirty Git state and create focused commits per phase.
2. Start with backend lint hygiene only if the team accepts a formatting/noise cleanup phase; otherwise keep backend lint known-red and use typecheck/tests as the immediate gate.
3. For feature/UI quality work, require targeted tests plus `pnpm typecheck`.
4. For backend/payment/dispatch/admin operations, add focused backend tests and audit-log verification.
5. For mobile UI changes, run `pnpm test:mobile:smoke`; for admin UI changes, run `pnpm test:admin:smoke`.

This step stops here by design. No corrections or app changes have been started.
