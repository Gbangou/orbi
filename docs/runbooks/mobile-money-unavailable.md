# Runbook - Mobile money indisponible

## Symptomes

- provider timeout;
- paiements restent pending;
- taux echec eleve;
- webhook absent.

## Diagnostic

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health
```

Verifier Admin:

- payment success rate;
- pending age;
- provider environment;
- refunds pending.

## Actions

1. Basculer l'app en message "paiement non confirme" si deja initie.
2. Ne pas confirmer manuellement sans preuve provider.
3. Si politique produit l'autorise, rendre cash/wallet disponibles via backend.
4. Suspendre nouveaux paiements mobile money si echec generalise.
5. Lancer reconciliation apres retour provider.

## Validation

Paiement test sandbox/production signe, montant XOF exact, ledger unique.
