# 16 - Modele Ledger Wallet Rider et Driver

Date d'audit: 2026-08-10

Perimetre:

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/riders/wallet-topup.service.ts`
- `apps/backend/src/modules/payments/payments.service.ts`
- `apps/backend/src/modules/admin/admin-driver-payouts.service.ts`
- `apps/backend/src/modules/admin/admin-support.service.ts`
- `apps/backend/src/modules/admin/dto/driver-wallet-recovery-adjustment.dto.ts`

## Synthese

Orbi dispose deja d'un ledger `WalletTransaction` associe a un solde materialise `Wallet.balance`. Le solde n'est pas modifiable par API publique directe; il est mis a jour dans des transactions Prisma avec une ecriture ledger et une reference idempotente.

Corrections appliquees:

- Recharge wallet Rider: montant entier obligatoire, transition finale conditionnelle, ledger verifie avant increment, replay idempotent sans double credit.
- Ajustement admin de recouvrement Driver: reference d'approbation secondaire obligatoire a partir de 50 000 XOF, puis stockee dans ledger et audit.
- Tests ajoutes pour montant non entier, double credit par replay, et controle renforce des gros ajustements.

## Modele Actuel

| Element attendu | Support actuel | Emplacement |
|---|---:|---|
| Ecriture immuable | Partiel | `WalletTransaction` n'a pas de route d'update; immutabilite applicative, pas encore contrainte DB explicite. |
| Type | Oui | `WalletTransactionType`: `CREDIT`, `DEBIT`, `ADJUSTMENT`, `PAYOUT`, `REFUND`. |
| Sens debit/credit | Oui | Type + `metadata.direction` sur les nouveaux flux consolides. |
| Montant | Oui | `amount Decimal(12,2)`. XOF entier impose sur les entrées top-up/checkout corrigees. |
| Devise | Indirect | Devise portee par `Wallet.currency`; a dupliquer en colonne ledger lors d'une migration future. |
| Reference | Oui | `reference`, unique par wallet. |
| Idempotency key | Partiel | Reference idempotente + metadata; pas de colonne separee. |
| Statut | Partiel | Statut des objets source (`PaymentAttempt`, `WalletTopUp`, `DriverPayout`) + metadata. |
| Source | Partiel | Metadata par flux; pas encore enum canonique. |
| Acteur | Partiel | Metadata et audit admin. |
| Date | Oui | `createdAt`. |
| Correlation | Partiel | `reference` + metadata `correlationId`. |
| Motif | Oui | `description`, `metadata.reason` ou notes admin. |
| Rapprochement | Partiel | Reconciliation paiement + audit; pas de table de rapprochement wallet dediee. |

## Flux Audites

| Flux | Garantie actuelle | Risque residuel |
|---|---|---|
| Recharge Rider | Webhook finalise une seule fois; ledger unique; replay sans increment. | Capture sandbox provider encore necessaire avant pilote. |
| Paiement Rider par wallet | Debit atomique via `updateMany` avec `balance >= amount`; ledger debit; tentative paiement creee dans la meme transaction. | Si aucun idempotency key client, la protection repose sur reference de tentative et flux serveur. |
| Credit Driver apres paiement | Ledger `payment:{attemptId}:driver-payout` unique; double credit bloque. | Commission stockee en metadata, pas en colonnes analytiques. |
| Remboursement | Reversal driver et refund rider idempotents par reference. | Wallet driver peut devenir negatif si payout deja retire puis refund; c'est un recouvrement operationnel a suivre. |
| Payout Driver | Ledger `PAYOUT`; solde suffisant verifie; concurrence absorbee par reference unique. | Le debit utilise le solde lu dans la transaction; une migration vers `updateMany balance >= amount` serait encore plus defensive. |
| Ajustement admin | Note, idempotency key, audit, acteur, ancienne/nouvelle valeur; controle renforce >= 50 000 XOF. | Pas encore de double approbation cryptographique ou workflow a deux acteurs. |
| Compensation support | Ledger credit unique par ticket/trip; audit support. | Metadata a harmoniser avec le modele canonique ci-dessous. |

## Regles Cibles

Toute modification de solde doit respecter cet ordre:

1. Valider role, propriete, statut source, devise et montant entier.
2. Construire une reference idempotente stable.
3. Ouvrir une transaction DB.
4. Verifier si le ledger existe deja.
5. Ecrire le ledger.
6. Mettre a jour le solde materialise avec un increment/decrement conditionnel.
7. Ecrire l'audit si action admin ou operation sensible.
8. Publier l'evenement temps reel apres commit logique.

Le champ `Wallet.balance` reste un cache operationnel. L'autorite comptable doit etre le ledger et ses references.

## Metadata Canonique

Les nouvelles ecritures doivent utiliser au minimum:

```json
{
  "direction": "CREDIT",
  "source": "wallet_top_up_webhook",
  "status": "COMPLETED",
  "correlationId": "reference-stable",
  "idempotencyKey": "reference-stable",
  "reason": "mobile_money_top_up_completed",
  "actorUserId": "ops-1"
}
```

Pour un ajustement admin de montant eleve:

```json
{
  "secondaryApprovalRequired": true,
  "secondaryApprovalReference": "finance-approval-001",
  "controlThresholdXof": 50000
}
```

## Tests Ajoutes ou Verifies

- `wallet-topup.service.spec.ts`
  - rejette les montants non entiers;
  - credite via ledger;
  - ne credite pas deux fois sur replay.
- `admin-driver-payouts.service.spec.ts`
  - exige une reference d'approbation secondaire pour un ajustement >= 50 000 XOF;
  - conserve cette reference dans ledger et audit.
- `payments.service.spec.ts`
  - debit wallet Rider avec solde suffisant;
  - refus solde insuffisant ou wallet verrouille;
  - credit Driver idempotent;
  - concurrence de creation ledger sans double increment;
  - remboursement et reversal idempotents;
  - payout/refund ne confirment pas arbitrairement un paiement provider.

## Recommandations Avant Production

| Gravite | Sujet | Correction recommandee |
|---|---|---|
| P1 | Colonnes ledger manquantes | Migration non destructive pour ajouter `currency`, `direction`, `status`, `source`, `actorUserId`, `correlationId`, `idempotencyKey`, `reason`, `reconciledAt`. |
| P1 | Solde materialise | Ajouter un job de reconciliation `Wallet.balance` vs somme ledger et alerte admin. |
| P1 | Gros ajustements | Remplacer la reference secondaire par un vrai workflow a deux acteurs avant production finance. |
| P2 | Payout Driver | Passer le debit final a un `updateMany` conditionnel `balance >= payout.amount` pour durcir la concurrence DB. |
| P2 | Immutabilite DB | Interdire les updates/deletes ledger via privileges DB ou trigger/audit selon l'environnement. |

Etat apres correction: acceptable pour tests internes finances/wallet; pas encore pret pour production financiere sans migration ledger canonique et reconciliation comptable automatique.
