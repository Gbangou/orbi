# Orbi Change Safety Policy

Date: 2026-08-10

## Scope

This policy governs app-wide quality work in the Orbi monorepo. It applies to:

- `apps/backend`
- `apps/admin-web`
- `apps/rider-app`
- `apps/driver-app`
- `packages/*`
- `docs/*`
- operational scripts and deployment files

## Non-Negotiable Rules

- Preserve existing uncommitted work unless the owner explicitly asks for changes.
- Do not use `git reset --hard`.
- Do not use `git clean -fd`.
- Do not perform massive deletion.
- Do not run destructive Prisma migrations.
- Do not run commands that modify a remote or production database.
- Do not expose `.env` secrets in logs, commits, documentation, or prompts.
- Prefer `pnpm` only. The repository declares `packageManager: pnpm@10.30.0`.
- Keep shared contracts in `packages/api`, `packages/domain`, `packages/config`, and `packages/ui` ahead of local duplicate types.
- For money, wallet, dispatch, support, trust, and admin operations, preserve auditability and idempotency.

## Git Safety

Before each change batch:

1. Run `git status --short --branch`.
2. Record pre-existing modified and untracked files.
3. Avoid editing files with unrelated user changes unless the task requires it.
4. Keep changes small enough to review.
5. Re-run `git status --short --branch` after verification.

Current pre-existing work at policy creation:

- Modified: `apps/rider-app/lib/rider-display-format.ts`
- Modified: `apps/rider-app/test/rider-display-format.test.ts`
- Untracked: `design/logo/orbi-icon.svg`

## Commit Strategy

- Commit only coherent, reviewable units.
- Use focused commits by domain: backend contract, admin UI, rider UI, driver UI, shared package, docs.
- Do not mix formatting-only churn with behavioral changes unless formatting is required to pass a gate.
- Mention tests run in commit messages or PR notes.
- Do not commit secrets, generated local logs, local `.env` files, or temporary artifacts.

## Rollback Strategy

Preferred rollback order:

1. Revert the specific commit with `git revert`.
2. For uncommitted agent changes, reverse only the files changed by that agent after confirming the file list.
3. For database changes, prefer forward corrective migrations over destructive rollback.
4. For production incidents, disable the relevant feature flag or deploy the last known good version before touching data.

Forbidden rollback shortcuts:

- `git reset --hard`
- `git clean -fd`
- Dropping or truncating tables
- Replaying migrations against a remote database without explicit environment confirmation

## Backup Strategy

- Use Git as the primary source backup before app changes.
- For large/high-risk work, create an explicit branch before implementation.
- Before schema or seed changes, export or snapshot local data if it matters.
- Remote database backups must be handled through the hosting/provider tooling and never assumed.
- Document rollback notes beside migrations and operational changes.

## Dangerous Commands

Treat these as unsafe unless explicitly requested and scoped:

- `git reset --hard`
- `git clean -fd`
- `Remove-Item -Recurse`
- `docker compose down -v`
- `pnpm prisma:migrate`
- `pnpm prisma:migrate:dev`
- `pnpm prisma:seed`
- `pnpm --filter backend prisma:migrate`
- `pnpm --filter backend prisma:migrate:dev`
- `pnpm --filter backend prisma:seed`
- `pnpm mobile:field`
- `pnpm mobile:apk:*:field`
- `pnpm field:api:check`
- any command using a production or remote `DATABASE_URL`
- any EAS build submitted to a remote service
- any script that frees ports or kills processes without checking owners

## Safe Verification Defaults

Use these first for local verification:

- `pnpm --filter backend exec prisma validate`
- `pnpm typecheck`
- `pnpm --filter backend test -- --runInBand`
- `pnpm test:admin:smoke`
- `pnpm test:mobile:smoke`
- `pnpm build`

Lint note: the root `pnpm lint` script eventually runs the backend lint script, and the backend lint script includes `--fix`. Use a non-mutating backend ESLint command for baseline checks unless formatting changes are explicitly part of the task.

## Conventions To Respect

- Node: repository requires `>=22`; observed local Node is `v24.16.0`.
- Package manager: `pnpm@10.30.0`.
- Apps:
  - backend: NestJS and Prisma
  - admin web: Next.js
  - rider app: Expo / React Native
  - driver app: Expo / React Native
- Database: PostgreSQL, local compose maps host port `5433` to container `5432`.
- Currency and payments: XOF and mobile money oriented, with PawaPay, Flutterwave, and CinetPay configuration placeholders.
- Realtime and rate limit adapters support in-memory mode and Redis URLs.
- Documentation should stay aligned when behavior changes.
