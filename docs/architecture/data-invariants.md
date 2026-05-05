# Mobilis Data Invariants

Ce document liste les invariants metier qui ne doivent pas dependre uniquement du code applicatif. Il complete `apps/backend/prisma/schema.prisma`, les migrations SQL et le noyau partage `packages/domain`.

## Invariants Non Exprimables Dans Prisma

Prisma ne sait pas representer les index uniques partiels PostgreSQL dans `schema.prisma`. Mobilis garde donc certains invariants dans les migrations SQL, avec les constantes applicatives correspondantes dans `packages/domain`.

### Un Seul Flux Actif Par Passager

Un passager ne peut pas avoir plusieurs flux ouverts en meme temps:

- une seule `RideRequest` active avec un statut `REQUESTED`, `MATCHED` ou `DRIVER_ARRIVING`
- une seule `Trip` active avec un statut `MATCHED`, `DRIVER_ARRIVING` ou `IN_PROGRESS`

Ces garanties existent a deux niveaux:

- applicatif: `RideRequestsService` verifie les demandes et courses actives dans une transaction avant creation
- base de donnees: migrations PostgreSQL avec index uniques partiels

Migrations importantes:

- `20260424135500_rider_single_active_flow`
- `20260426123000_restore_rider_active_flow_indexes`

Index SQL:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "ride_requests_single_active_per_rider_idx"
ON "ride_requests" ("rider_id")
WHERE "status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVING');

CREATE UNIQUE INDEX IF NOT EXISTS "trips_single_active_per_rider_idx"
ON "trips" ("rider_id")
WHERE "status" IN ('MATCHED', 'DRIVER_ARRIVING', 'IN_PROGRESS');
```

Les listes de statuts doivent rester alignees avec:

- `activeRideRequestLifecycleStatuses`
- `activeTripLifecycleStatuses`
- `allowedTripLifecycleTransitions`

### Reference Fournisseur Paiement Unique

Une reference fournisseur de paiement ne peut etre reconciliee qu'une seule
fois pour un fournisseur donne. Cela protege les webhooks contre les retries,
les doubles notifications et les collisions entre `transactionRef` Mobilis et
reference externe.

Garantie:

- applicatif: `PaymentsService` traite un webhook portant deja le meme
  `providerReference` comme un replay idempotent, et ignore une reference deja
  attachee a une autre transaction Mobilis
- base de donnees: contrainte unique composite sur `provider` et
  `providerReference`

Migration importante:

- `20260427102000_payment_provider_reference_idempotency`

### Ecriture Ledger Chauffeur Idempotente

Un paiement fournisseur `SUCCEEDED` ne peut produire qu'une seule ecriture de
payout chauffeur par wallet. Cela protege les revenus chauffeur contre les
replays webhook, les relances ops et les doubles notifications fournisseur.

Garantie:

- applicatif: `PaymentsService` ecrit une transaction wallet referencee
  `payment:<paymentAttemptId>:driver-payout` uniquement apres reconciliation
  reussie, et ignore l'ecriture si elle existe deja
- base de donnees: contrainte unique composite sur `walletId` et `reference`
  dans `WalletTransaction`
- metadonnees: l'ecriture conserve le montant brut, la commission Mobilis, le
  payout chauffeur, le `paymentAttemptId`, la course et la reference fournisseur

Migration importante:

- `20260430193000_wallet_transaction_reference_idempotency`

### Payout Chauffeur Prepare Une Seule Fois

Un wallet chauffeur ne peut pas avoir deux payouts `PREPARED` en meme temps.
Cela protege les operations terrain contre deux validations de paiement sur le
meme solde.

Garantie:

- applicatif: `AdminService.prepareDriverWalletPayout` refuse les wallets
  verrouilles ou sans solde payable, et retourne le payout prepare existant si
  une preparation est deja ouverte
- base de donnees: `DriverPayout.preparedLockKey` est unique; il vaut l'id du
  wallet uniquement pendant l'etat `PREPARED`, puis repasse a `null` quand le
  payout est marque `PAID`
- ledger: `AdminService.markDriverPayoutPaid` ecrit une transaction
  `WalletTransaction` de type `PAYOUT` avec la reference idempotente
  `driver-payout:<driverPayoutId>:paid`, puis decremente le solde du wallet
- audit settlement: les exports CSV/PDF passent par
  `AdminService.driverPayoutSettlement*`, ecrivent un audit log, et incluent la
  signature prepare/payee plus les notes d'approbation bornees
- verification provider: `PaymentsService.verifyPaymentAttemptWithProvider`
  refuse de reconcilier si le montant ou la devise retournes par le provider ne
  correspondent pas a `PaymentAttempt.amount/currency`; si tout concorde, la
  reconciliation reutilise le chemin webhook idempotent

Migration importante:

- `20260430203000_driver_payouts`

### Recouvrement Apres Refund

Un refund apres payout chauffeur deja paye peut rendre le solde wallet negatif.
Ce solde negatif est un signal ops de recouvrement, pas un solde payable.

Garantie:

- applicatif: le refund ecrit une transaction `WalletTransaction` de type
  `REFUND` referencee `payment:<paymentAttemptId>:driver-payout-refund`
- provider: en mode `PAYMENTS_REFUND_MODE=provider`, un refund peut rester
  `REFUND_PENDING`; aucune reversal wallet n'est appliquee avant confirmation
  provider `REFUNDED`
- webhook refund: les callbacks refund sont journalises separement du paiement
  initial; un webhook processed reutilise la meme finalisation idempotente que
  le polling provider
- audit ops: le journal webhook expose un filtre metier
  `kind=payment|refund|ignored` pour eviter aux ops de manipuler directement
  les actions internes
- admin: `AdminService.driverWallets` expose `recoveryDue` par wallet, plus
  `recoveryWalletCount` et `totalRecoveryDue` dans le resume
- recouvrement: `AdminService.recordDriverWalletRecoveryAdjustment` exige une
  note ops, un montant positif et une cle d'idempotence, puis ecrit une
  transaction `ADJUSTMENT` referencee
  `driver-wallet-recovery:<walletId>:<idempotencyKey>`
- operations: les wallets avec `recoveryDue > 0` ne doivent pas generer de
  nouveau payout prepare tant que le solde n'est pas redevenu positif

## Contrats Enum Prisma / Domaine

Le backend, les apps Expo, l'admin web et le client API partagent les enums exposes par `packages/domain`. Les enums Prisma restent la source des tables et contraintes SQL. Le test `domain-prisma-contract.spec.ts` compare les deux mondes pour eviter une divergence silencieuse.

Contrats couverts:

- `VehicleType`
- `ServiceTier`
- `PricingCity`
- `DistrictProfile`
- statuts actifs `RideRequestStatus`
- statuts actifs `TripStatus`
- transitions autorisees de `TripStatus`

## Regle De Changement

Quand une enum metier change:

1. Mettre a jour `apps/backend/prisma/schema.prisma`.
2. Ajouter une migration Prisma/SQL.
3. Mettre a jour `packages/domain/src/index.ts`.
4. Mettre a jour les DTO backend si la surface API change.
5. Relancer `pnpm prisma:generate`, `pnpm --filter backend test -- --runInBand`, puis `pnpm typecheck`.
6. Mettre a jour `docs/architecture/class-diagram.md` et `docs/architecture/use-case-diagram.md` si le comportement visible change.
