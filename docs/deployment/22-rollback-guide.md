# Orbi - Guide de rollback

Date: 2026-08-10

## Principe

Rollback applicatif et rollback base de donnees sont separes. Une migration Prisma deploy doit etre traitee comme irreversible par defaut tant qu'une migration corrective n'est pas ecrite et testee.

## Decision rapide

| Situation | Action |
| --- | --- |
| Build ou boot application casse, sans migration destructive | Revenir a l'image/commit precedent. |
| Migration echouee avant application | Stopper release, garder ancienne version en service. |
| Migration appliquee et bug applicatif | Preferer hotfix compatible schema ou feature flag off. |
| Corruption donnees | Geler ecritures, backup immediat, restauration ciblee ou point-in-time si disponible. |
| Paiements incoherents | Ne jamais rollback DB sans reconciliation paiements. |

## Rollback staging Docker Compose

Depuis `deploy/staging`:

```bash
docker compose ps
docker compose logs --tail=200 backend
git rev-parse --short HEAD
git switch <branche-ou-tag-stable>
docker compose build backend admin-web
docker compose up -d backend admin-web
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```

Si le backend ne redevient pas ready:

```bash
docker compose logs --tail=300 backend
docker compose restart backend
```

## Rollback production generique

Commandes a adapter au fournisseur choisi:

```bash
# Identifier version active et version precedente
git rev-parse --short HEAD

# Construire et redemarrer la version precedente
git switch <tag-ou-commit-stable>
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm build:backend
pnpm build:admin
pnpm --filter backend start:prod
```

En environnement conteneurise, remplacer par le redeploiement de l'image precedente taguee.

## Rollback base de donnees

Ne pas executer `DROP`, `TRUNCATE`, `db push --force-reset` ou restoration globale sans decision explicite.

Procedure:

1. Basculer l'application en maintenance ou desactiver les ecritures sensibles par feature flag.
2. Capturer un backup immediat de l'etat casse.
3. Identifier migration fautive et donnees affectees.
4. Ecrire une migration corrective forward-only.
5. Tester sur copie de staging.
6. Appliquer en production.
7. Rejouer la reconciliation paiements/portefeuilles.

Commandes utiles:

```bash
pnpm --filter backend exec prisma migrate status
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend test -- prisma-migration-invariants --runInBand
```

## Verifications apres rollback

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/live
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
pnpm field:api:check
```

Verifier manuellement:

- aucune double demande active rider;
- aucun paiement confirme sans ledger;
- job queue non bloquee;
- admin accessible uniquement aux roles autorises.
