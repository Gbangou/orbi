# Orbi - Guide sauvegarde et restauration

Date: 2026-08-10

## Donnees critiques

| Donnee | Criticite | Strategie |
| --- | --- | --- |
| PostgreSQL | P0 | Backup planifie, test restore, PITR si fournisseur le permet. |
| Documents chauffeurs | P0 | Stockage prive durable, sauvegarde provider, URLs signees. |
| Secrets | P0 | Gestionnaire de secrets externe, rotation documentee. |
| Logs/audit | P1 | Retention externe, horodatage, correlation IDs. |
| APK/build artifacts | P2 | Reproductibles depuis Git; stockage release optionnel. |

## Backup Postgres Docker staging

Depuis `deploy/staging`:

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-orbi} --format=custom --no-owner --no-acl > backups/orbi-$(date -u +%Y%m%dT%H%M%SZ).dump
```

Verifier le dump:

```bash
ls -lh backups
docker compose exec -T db pg_restore --list < backups/<dump>.dump > /tmp/orbi-restore-list.txt
```

## Restore staging sur base vide

Ne jamais restaurer par-dessus une base active sans fenetre de maintenance.

```bash
docker compose stop backend admin-web
docker compose exec -T db dropdb -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-orbi}
docker compose exec -T db createdb -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-orbi}
docker compose exec -T db pg_restore -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-orbi} --clean --if-exists < backups/<dump>.dump
docker compose run --rm migrate
docker compose up -d backend admin-web
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```

## Production

Sans fournisseur choisi, exiger au minimum:

- backup automatique quotidien;
- retention 7 jours minimum staging, 30 jours minimum production;
- point-in-time recovery pour production argent reel;
- test de restauration mensuel;
- export chiffré et accès limite aux operateurs autorises.

Commandes generiques PostgreSQL:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl > orbi-prod-$(date -u +%Y%m%dT%H%M%SZ).dump
pg_restore --list orbi-prod-<timestamp>.dump
createdb "$RESTORE_DATABASE_URL"
pg_restore --dbname "$RESTORE_DATABASE_URL" --clean --if-exists orbi-prod-<timestamp>.dump
```

## Verification fonctionnelle apres restore

```bash
pnpm --filter backend exec prisma migrate status
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```

Puis verifier dans l'admin:

- riders/drivers visibles;
- wallets et ledger coherents;
- payment attempts reconciliables;
- derniers audit logs presents;
- documents chauffeurs consultables via liens signes.

## Interdits

- Pas de backup non chiffre sur poste personnel pour donnees production.
- Pas de restauration production sans ticket incident et validation responsable.
- Pas de suppression de migrations pour "faire passer" Prisma.
- Pas de seed en production.
