# Runbook - Webhook en echec

## Symptomes

- hausse des webhooks rejetes;
- signatures invalides;
- evenements dupliques ou hors ordre;
- provider envoie vers mauvaise URL.

## Diagnostic

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```

Dans Admin:

- Payment webhook journal;
- payment attempts;
- refunds.

Verifier variables:

- `PAYMENTS_DEFAULT_WEBHOOK_URL`
- `PAYMENTS_WEBHOOK_SECRET`
- `PAWAPAY_WEBHOOK_SECRET`
- mode `PAWAPAY_ENVIRONMENT`

## Actions

1. Ne jamais accepter un webhook sans signature valide.
2. Corriger URL/secret dans le provider.
3. Rejouer les evenements depuis l'admin seulement si l'evenement est conserve et idempotent.
4. Sur replays suspects: rotation secret et blocage temporaire provider.

## Validation

Webhook test signe accepte; doublon rejete sans double credit.
