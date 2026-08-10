# Orbi - Guide de deploiement staging et production

Date: 2026-08-10  
But: preparer local, test, staging et production sans deployer sur une infrastructure inconnue.

## Environnements

| Environnement | Usage | Donnees | Commandes typiques |
| --- | --- | --- | --- |
| local | Developpement individuel | Jetables | `pnpm install --frozen-lockfile`, `pnpm db:start`, `pnpm prisma:migrate`, `pnpm dev:backend` |
| test | CI et tests automatises | Jetables, Postgres CI | `pnpm prisma:generate`, `pnpm --filter backend exec prisma migrate deploy`, `pnpm typecheck`, `pnpm test:production:gate` |
| staging | Validation pre-pilote | Copie controlee ou jeu pilote, jamais prod brute non anonymisee | `docker compose up -d --build`, `curl https://$ORBI_API_DOMAIN/api/v1/health/ready` |
| production | Utilisateurs reels et argent reel | Donnees critiques | Meme sequence que staging, avec secrets prod, backups verifies, rollback prepare |

## Etat observe dans le repo

- Validation env backend: `apps/backend/src/config/environment.validation.ts`.
- Examples env: `apps/backend/.env.example`, `apps/admin-web/.env.example`, `apps/rider-app/.env.example`, `apps/driver-app/.env.example`, `deploy/staging/.env.example`.
- Staging Docker Compose: `deploy/staging/docker-compose.yml`.
- Dockerfiles staging attendus par compose: `deploy/staging/backend.Dockerfile`, `deploy/staging/admin-web.Dockerfile`.
- Health endpoints backend: `/api/v1/health`, `/api/v1/health/live`, `/api/v1/health/ready`.
- Migration command: `pnpm --filter backend prisma:migrate` ou `pnpm --filter backend exec prisma migrate deploy`.
- CI gates: voir `docs/quality/20-ci-cd-gates.md`.

## Variables obligatoires

Ne jamais commiter de `.env` runtime. Les exemples peuvent contenir uniquement des placeholders ou secrets dev clairement inutilisables en production.

### Backend

| Variable | local | test | staging | production |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | `test` | `production` | `production` |
| `DATABASE_URL` | Local Postgres | CI Postgres | Secret externe | Secret externe |
| `FRONTEND_ALLOWED_ORIGINS` | localhost apps | localhost/CI | domaine admin staging | domaine admin production |
| `TRUST_PROXY` | `false` | `false` | `true` derriere reverse proxy | `true` derriere reverse proxy |
| `ENABLE_SWAGGER` | `true` | `false` | `false` | `false` |
| `RATE_LIMIT_ADAPTER` | `in-memory` | `postgres` ou `in-memory` | `postgres` ou `redis` | `postgres` ou `redis` |
| `RATE_LIMIT_STRICT` | `false` | `true` | `true` | `true` |
| `REALTIME_ADAPTER` | `in-memory` | `postgres` | `postgres` ou `redis` | `postgres` ou `redis` |
| `REALTIME_STRICT` | `false` | `true` | `true` | `true` |
| `PAYMENTS_PROVIDER` | sandbox/manual | mocked/sandbox | sandbox ou fournisseur pilote | fournisseur production |
| `PAYMENTS_CURRENCY` | `XOF` | `XOF` | `XOF` | `XOF` |
| `PAYMENTS_WEBHOOK_SECRET` | dev only | CI secret | secret externe | secret externe |
| `PAWAPAY_API_TOKEN` | vide ou sandbox | vide/sandbox | sandbox/pilote | production |
| `PAWAPAY_WEBHOOK_SECRET` | vide ou sandbox | vide/sandbox | sandbox/pilote | production |
| `PAWAPAY_ENVIRONMENT` | `sandbox` | `sandbox` | `sandbox` avant argent reel | `production` seulement apres go-live |
| `DOCUMENT_SIGNING_SECRET` | dev only | CI secret | secret externe | secret externe |
| `DOCUMENT_OBJECT_PROVIDER` | local | local/mock | stockage prive | stockage prive durable |
| `MOBILE_ERROR_COLLECTOR_PROVIDER` | local | local/webhook | webhook externe | webhook externe |

## Preflight obligatoire

Depuis la racine:

```bash
pnpm install --frozen-lockfile
pnpm quality:source
pnpm format:check
pnpm typecheck
pnpm --filter backend exec prisma validate
pnpm --filter backend test -- --runInBand
pnpm test:admin:smoke
pnpm test:mobile:smoke
pnpm build:backend
pnpm build:admin
pnpm build:rider:ci
pnpm build:driver:ci
```

Etat actuel connu: `pnpm lint:check` est une gate reelle mais rouge a cause d'une dette backend existante. Ne pas promouvoir cette gate en obligatoire production tant qu'elle n'est pas remise au vert.

## Deploiement staging Docker Compose

Sur le serveur staging:

```bash
git clone <repo-orbi> orbi
cd orbi/deploy/staging
cp .env.example .env
```

Renseigner au minimum:

- `ORBI_API_DOMAIN`
- `ORBI_ADMIN_DOMAIN`
- `POSTGRES_PASSWORD`
- `PAYMENTS_WEBHOOK_SECRET`
- `DOCUMENT_SIGNING_SECRET`
- secrets du fournisseur mobile money si active

Puis:

```bash
docker compose pull
docker compose build
docker compose run --rm migrate
docker compose up -d backend admin-web caddy
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/live
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
curl -I https://$ORBI_ADMIN_DOMAIN
```

Pour seed staging ferme uniquement:

```bash
docker compose run --rm seed
```

## Production sans fournisseur impose

Sequence generique:

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm --filter backend exec prisma validate
pnpm --filter backend exec prisma migrate status
pnpm --filter backend exec prisma migrate deploy
pnpm build:backend
pnpm build:admin
pnpm --filter backend start:prod
```

Si l'infrastructure utilise des conteneurs, reprendre la sequence staging avec images taguees et registry definie par l'equipe. Ne pas lancer `prisma:seed` en production.

## Verification post-deploiement

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/live
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health
curl -I https://$ORBI_ADMIN_DOMAIN
```

Verifier ensuite dans l'admin:

- readiness runtime;
- incidents health;
- payment webhook journal;
- job queue;
- driver onboarding queue;
- launch readiness.

## Conditions de promotion production

- Backup restaure teste.
- Migration appliquee sur staging avec donnees representatives.
- Paiements sandbox provider verifies avec signature webhook.
- CORS strict sur domaines reels.
- Swagger desactive.
- Secrets dans le gestionnaire de secrets de l'infra, pas dans Git.
- Logs et erreurs mobiles raccordes a un collecteur externe.
- Runbook rollback disponible et responsable d'astreinte designe.
