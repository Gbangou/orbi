# 15 - Securite Paiements et Rapprochement

Date d'audit: 2026-08-10

Perimetre inspecte et corrige:

- `apps/backend/src/modules/payments/payments.service.ts`
- `apps/backend/src/modules/payments/pawapay.service.ts`
- `apps/backend/src/modules/payments/payment-attempt-reconciliation-sweep.service.ts`
- `apps/backend/src/modules/payments/payment-fixture-manifest.ts`
- `apps/backend/src/modules/payments/fixtures/*`
- `apps/backend/src/modules/payments/dto/create-checkout-intent.dto.ts`
- `apps/backend/prisma/schema.prisma`

## Synthese

Le flux paiement Orbi est base sur une tentative locale `PaymentAttempt`, une reference unique `transactionRef`, une reconciliation par webhook ou verification fournisseur, puis des ecritures wallet idempotentes. Le montant de la course est relu cote serveur depuis la demande de course; le montant client est seulement accepte comme garde-fou de confirmation et il est rejete s'il diverge.

Corrections appliquees pendant cette etape:

- Montant checkout entier au niveau DTO avec `@IsInt()`.
- Reconnaissance des references Flutterwave natives `flw_ref` dans la reconciliation webhook.
- Classification des webhooks dupliques comme replays idempotents par reference fournisseur ou par `transactionRef` deja dans le meme etat.
- Rejet journalise des evenements hors ordre qui tentent de degrader un paiement confirme.
- Passage des tentatives PawaPay externes en `PENDING` apres dispatch accepte ou dispatch incertain.
- File durable de reconciliation lorsque l'appel fournisseur PawaPay timeout apres creation locale.
- Fixtures reproductibles ajoutees pour paiement PawaPay en attente, doublon Flutterwave, evenement Flutterwave tardif.

## Etat Machine

| Etat produit attendu | Etat Prisma actuel | Support actuel | Commentaire |
|---|---|---:|---|
| cree | creation locale avant retour checkout | Partiel | Pas d'enum dedie. Une tentative persistee demarre en general a `INITIATED`. |
| initie | `INITIATED` | Oui | Etat initial des paiements externes avant acceptation provider. |
| en attente | `PENDING` | Oui | Utilise pour provider accepte, provider incertain, ou webhook pending. |
| confirme | `SUCCEEDED` | Oui | Declenche le credit chauffeur idempotent. |
| echoue | `FAILED` | Oui | Aucun mouvement wallet. |
| expire | absent | Non | Ecart restant: ajouter `EXPIRED` et une politique d'expiration explicite. |
| annule | `CANCELLED` | Oui | Present dans le schema, a consolider par regles produit. |
| remboursement en attente | `REFUND_PENDING` | Oui | Utilise pour refund provider async. |
| rembourse | `REFUNDED` | Oui | Declenche compensation wallet idempotente. |
| conteste | absent | Non | Ecart restant: ajouter `DISPUTED` si les providers remontent des litiges. |

## Garanties Actuelles

| Principe | Statut | Implementation |
|---|---:|---|
| Montant calcule cote serveur | OK | `resolveCheckoutAmount()` relit `rideRequest.estimatedFare`; divergence client rejetee. |
| Montant entier | OK | DTO `CreateCheckoutIntentDto.amount` valide `@IsInt()`; PawaPay recoit une chaine XOF entiere. |
| Devise explicite | OK | `currency` stockee dans `PaymentAttempt` et controlee sur webhook succes. |
| Reference unique | OK | `transactionRef` unique en base. |
| Idempotency key | Partiel | Cle supportee et protegee par `@@unique([userId, idempotencyKey])`; pas encore strictement obligatoire pour tous les clients. |
| Transaction DB | OK | Wallet debit, tentative, wallet ledger et refund utilisent des transactions Prisma. |
| Controle concurrence | OK | Contraintes uniques et `updateMany` conditionnels evitent doubles mouvements. |
| Signature webhook | OK | Secrets communs, Flutterwave hash optionnel, PawaPay HMAC. |
| Prevention replay | OK | Webhooks conserves; replays detectes par provider reference et etat deja atteint. |
| Gestion doublons | OK | `persisted_idempotent_replay`, pas de second mouvement wallet. |
| Evenements hors ordre | OK | Tentative confirmee non degradable par pending/failed/cancelled tardif. |
| Conservation evenement | OK | `PaymentWebhookEvent` conserve hash body, payload, signatureVerified, action. |
| Rapprochement | OK | Sweep stale `INITIATED/PENDING` + verification provider. |
| Audit | Partiel | Webhook et mouvements wallet sont traces; audit admin finance reste a uniformiser. |
| Compensation | OK | Refund inverse le credit chauffeur avec reference de reversal idempotente. |

## Webhooks

Les webhooks sans reference sont conserves avec `ignored_missing_reference`. Les references inconnues sont conservees avec `ignored_unknown_reference` sans mise a jour paiement. Les references provider deja liees a une autre transaction sont conservees avec `ignored_conflicting_provider_reference`.

Pour un succes provider:

- le montant provider doit correspondre au montant local;
- la devise provider doit correspondre a la devise locale;
- un paiement deja `SUCCEEDED` reste `SUCCEEDED`;
- un webhook tardif `FAILED` ou `PENDING` apres `SUCCEEDED` est journalise `ignored_out_of_order`.

## Fixtures Reproductibles

Fixtures existantes et ajoutees:

- Succes: `flutterwave-charge-completed-webhook.json`, `cinetpay-payment-completed-webhook.json`
- Echec: `flutterwave-charge-failed-webhook.json`, `cinetpay-payment-failed-webhook.json`
- En attente: `pawapay-payment-pending-webhook.json`
- Remboursement reussi: `flutterwave-refund-processed-webhook.json`
- Remboursement en attente: `flutterwave-refund-pending-webhook.json`
- Doublon: `flutterwave-charge-completed-duplicate-webhook.json`
- Evenement tardif: `flutterwave-charge-failed-late-webhook.json`
- Reference inconnue: `flutterwave-unknown-reference-webhook.json`

Important: ces fixtures sont `schema_compliant` ou `local_policy`; aucune capture sandbox reelle n'est encore marquee `sandbox_capture`. Le pilote paiement doit donc exiger au moins une capture signee par fournisseur actif.

## Tests Couverts

Tests unitaires paiement couverts dans `payments.service.spec.ts`:

- webhook sans secret valide;
- signature Flutterwave invalide;
- webhook duplique;
- webhook rejoue;
- reference inconnue;
- montant different;
- devise differente;
- evenement hors ordre;
- paiement deja confirme;
- remboursement repete;
- timeout fournisseur PawaPay entre creation locale et dispatch;
- idempotence checkout;
- non duplication du ledger chauffeur;
- fixture pending;
- fixture late event;
- fixture refund.

Tests associes:

- `pawapay.service.spec.ts`: contrat sandbox v2, mapping mobile money, signature webhook.
- `payment-attempt-reconciliation-sweep.service.spec.ts`: sweep, retry, non-chevauchement, snapshot operationnel.
- `payments.security.spec.ts`: exposition publique et hygiene de donnees paiement.

## Risques Restants

| Gravite | Risque | Impact | Recommandation |
|---|---|---|---|
| P1 | Pas d'etats `EXPIRED` et `DISPUTED` dans Prisma | Expiration et litiges non representes explicitement | Ajouter migration non destructive avec politique de transitions. |
| P1 | Idempotency key supportee mais pas obligatoire partout | Clients anciens peuvent creer deux intentions si double clic hors protection UI | Rendre la cle obligatoire apres migration client et fenetre de compatibilite. |
| P1 | Pas de capture sandbox signee dans le manifest | Preuve provider insuffisante avant pilote reel | Capturer webhooks Flutterwave/CinetPay/PawaPay sandbox et les marquer `sandbox_capture`. |
| P2 | Audit finance/admin non totalement unifie | Enquete operationnelle plus lente | Normaliser un journal finance avec acteur, motif, ancienne/nouvelle valeur, correlationId. |
| P2 | Politique d'expiration/annulation a formaliser cote provider | Tentatives stale peuvent rester reconciliables longtemps | Ajouter TTL checkout, job d'expiration et mapping provider annule/expire. |

## Recommandation

Etat apres correction: pret pour tests internes paiement backend avec fixtures reproductibles.

Pas encore pret pour pilote paiement reel tant que les captures sandbox signees et les etats `EXPIRED`/`DISPUTED` n'ont pas ete ajoutes ou explicitement exclus par decision produit documentee.
