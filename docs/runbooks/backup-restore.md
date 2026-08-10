# Runbook - Restauration de sauvegarde

## Quand

- corruption donnees;
- mauvaise migration;
- suppression accidentelle;
- test mensuel de restauration.

## Procedure staging

```bash
cd deploy/staging
docker compose stop backend admin-web
mkdir -p backups
docker compose exec -T db pg_dump -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-orbi} --format=custom --no-owner --no-acl > backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump
docker compose exec -T db dropdb -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-orbi}
docker compose exec -T db createdb -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-orbi}
docker compose exec -T db pg_restore -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-orbi} --clean --if-exists < backups/<dump>.dump
docker compose run --rm migrate
docker compose up -d backend admin-web
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```

## Production

Utiliser l'outil du fournisseur choisi ou `pg_restore` sur une base isolee. Ne pas restaurer production sans validation incident.

## Verification

- migrations OK;
- health ready OK;
- paiements et ledger coherents;
- documents chauffeurs accessibles;
- audit logs presents.
