# Runbook - Migration echouee

## Impact

P0 si la migration bloque le demarrage ou l'argent. P1 si staging seulement.

## Diagnostic

```bash
pnpm --filter backend exec prisma migrate status
pnpm --filter backend exec prisma validate
```

Docker staging:

```bash
cd deploy/staging
docker compose logs --tail=300 migrate
docker compose ps
```

## Actions

1. Stopper le deploiement.
2. Ne pas modifier la table `_prisma_migrations` manuellement.
3. Capturer les logs.
4. Faire un backup de l'etat courant.
5. Corriger la migration dans un nouveau commit.
6. Tester sur une copie de staging.

## Reprise

```bash
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend exec prisma migrate status
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```
