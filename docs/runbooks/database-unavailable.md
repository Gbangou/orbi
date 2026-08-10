# Runbook - Base indisponible

## Symptomes

- `/api/v1/health/ready` KO;
- erreurs Prisma;
- timeouts API;
- queue et paiements bloqués.

## Diagnostic

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health || true
pnpm --filter backend exec prisma migrate status
```

Docker staging:

```bash
cd deploy/staging
docker compose ps db
docker compose logs --tail=200 db
docker compose exec db pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-orbi}
```

## Actions

- Redemarrer DB seulement si panne de service confirmee.
- Si stockage plein: liberer espace ou augmenter volume.
- Si credentials invalides: rotation via secret manager, puis restart backend.
- Si corruption: suivre `restoration-backup.md`.

## Verification

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```
