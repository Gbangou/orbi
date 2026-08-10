# Runbook - Queue bloquee

## Symptomes

- jobs pending augmentent;
- paiement/reconciliation/document scanner en retard;
- health signale job queue degradee.

## Diagnostic

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health
```

Dans Admin:

- Job queue;
- oldest job age;
- failed jobs;
- dead letters.

Docker staging:

```bash
cd deploy/staging
docker compose logs --tail=300 backend
```

## Actions

- Verifier `JOB_QUEUE_WORKER_ENABLED=true`.
- Redemarrer backend si worker bloque.
- Requeue jobs uniquement depuis l'admin, avec audit.
- Pour job poison: isoler, corriger code/donnees, puis requeue.

## Validation

Queue diminue, oldest job age revient sous seuil, health ready OK.
