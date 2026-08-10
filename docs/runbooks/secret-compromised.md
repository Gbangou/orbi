# Runbook - Secret compromis

## Exemples

- token provider mobile money;
- webhook secret;
- `DATABASE_URL`;
- `DOCUMENT_SIGNING_SECRET`;
- session admin exposee.

## Actions immediates

1. Revoquer le secret chez le fournisseur.
2. Generer un nouveau secret.
3. Mettre a jour le gestionnaire de secrets de l'environnement.
4. Redemarrer les services dependants.
5. Chercher usages non autorises.

Commandes verification:

```bash
pnpm test:security:source
pnpm test:source-risk
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
```

## Paiements

Si secret webhook compromis:

- refuser anciens messages;
- surveiller replays;
- reconciler les paiements de la fenetre d'exposition.

## Sortie

Incident documente, secret rotate, traces auditees, aucune fuite persistante dans Git.
