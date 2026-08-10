# Runbook - Rollback

## Declencheurs

- readiness KO apres release;
- taux erreur API anormal;
- paiement ou wallet incoherent;
- bug critique Rider/Driver.

## Procedure

```bash
git rev-parse --short HEAD
git switch <commit-ou-tag-stable>
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm build:backend
pnpm build:admin
```

Staging Docker:

```bash
cd deploy/staging
docker compose build backend admin-web
docker compose up -d backend admin-web
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```

## Base de donnees

Ne jamais revenir en arriere par suppression de migration. Utiliser une migration corrective forward-only ou une restauration validee.

## Sortie d'incident

- health ready OK;
- paiements reconciles;
- wallet ledger coherent;
- action documentee avec commit stable.
