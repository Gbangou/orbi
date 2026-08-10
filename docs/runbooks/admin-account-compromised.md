# Runbook - Compte admin compromis

## Symptomes

- connexion admin inhabituelle;
- changement role non reconnu;
- action finance/onboarding/support suspecte;
- export anormal.

## Actions immediates

1. Revoquer la session admin.
2. Revoquer toutes les sessions de l'utilisateur.
3. Suspendre ou reduire le role.
4. Examiner audit logs: acteur, date, ancienne/nouvelle valeur, correlation ID.
5. Rotation des secrets si fuite possible.

## Verification

- aucun autre compte privilegie cree;
- pas de payout/refund/document decision suspect;
- aucun export non autorise;
- roles support/ops/finance/admin coherents.

## Reprise

Reattribuer acces avec MFA/politique externe si disponible. Documenter l'incident et les donnees potentiellement exposees.
