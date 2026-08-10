# Runbook - Paiement bloque

## Symptomes

- paiement reste `PENDING`;
- rider debite mais portefeuille non credite;
- webhook absent ou rejete;
- refund en attente trop long.

## Diagnostic

Verifier dans Admin:

- payment attempts;
- payment webhook events;
- wallet ledger;
- support ticket lie.

Commandes utiles:

```bash
curl -fsS https://$ORBI_API_DOMAIN/api/v1/health/ready
pnpm --filter backend test -- payments.service.spec.ts --runInBand
```

## Actions

1. Ne pas modifier un solde manuellement.
2. Conserver la reference provider et `correlationId`.
3. Rejouer uniquement si idempotency key et signature sont valides.
4. Si provider confirme paiement mais Orbi non: creer compensation via service admin audite.
5. Si Orbi confirme mais provider non: marquer investigation, ne pas crediter deux fois.

## Escalade

Escalader Finance/Ops si argent reel, montant divergent ou remboursement repete.
