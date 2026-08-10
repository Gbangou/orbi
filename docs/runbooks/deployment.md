# Runbook - Deploiement

## Quand

Nouvelle version backend/admin/mobile, staging ou production.

## Avant de commencer

```bash
pnpm install --frozen-lockfile
pnpm quality:source
pnpm format:check
pnpm typecheck
pnpm --filter backend exec prisma validate
pnpm --filter backend test -- --runInBand
pnpm build:backend
pnpm build:admin
```

Ne pas continuer si une gate P0 echoue.

## Staging Docker

```bash
cd deploy/staging
cp .env.example .env
docker compose build
docker compose run --rm migrate
docker compose up -d backend admin-web caddy
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```

## Production

Ne pas inventer le fournisseur. Adapter la sequence au runtime choisi:

```bash
pnpm prisma:generate
pnpm --filter backend exec prisma migrate deploy
pnpm build:backend
pnpm build:admin
pnpm --filter backend start:prod
```

## Validation

- `/api/v1/health/live` OK.
- `/api/v1/health/ready` OK.
- Admin accessible.
- Payment webhook journal consultable.
- Job queue non bloquee.
- Aucun incident critique nouveau.
