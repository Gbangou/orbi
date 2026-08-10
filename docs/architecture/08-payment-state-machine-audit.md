# Orbi - Audit machine a etats paiement

Date d'audit: 2026-08-10  
Portee: Prisma schema, `PaymentsService`, wallet, webhooks, remboursements, interactions trip/ride request.  
Regle de travail: audit documentaire uniquement.

## Etats Existants

### PaymentAttempt

| Etat | Sens metier | Terminal | Source |
|---|---|---|---|
| `INITIATED` | tentative creee localement | non | Prisma |
| `PENDING` | provider en attente | non | Prisma |
| `SUCCEEDED` | paiement confirme | oui pour paiement, non pour refund | Prisma |
| `FAILED` | paiement echoue | oui | Prisma |
| `CANCELLED` | tentative annulee | oui | Prisma |
| `REFUND_PENDING` | remboursement lance, confirmation attendue | non | Prisma |
| `REFUNDED` | remboursement confirme | oui | Prisma |

### WalletTopUp

| Etat | Sens metier | Terminal |
|---|---|---|
| `INITIATED` | top-up cree | non |
| `PENDING` | provider en attente | non |
| `COMPLETED` | solde credite | oui |
| `FAILED` | top-up echoue | oui |
| `CANCELLED` | top-up annule | oui |

## Transitions Paiement Observees

| ID | Gravite | Transition | Acteur | Validations | Effets secondaires | Ecritures DB | Anomalie |
|---|---|---|---|---|---|---|---|
| PSM-001 | P1 | `null -> INITIATED` checkout | Rider | session Rider, ownership ride request, idempotency key/hash, amount/currency | appel provider si configure | `PaymentAttempt` unique transactionRef | risque de race si request devient `MATCHED` avant checkout |
| PSM-002 | P1 | `INITIATED -> PENDING` provider | Backend/provider | provider configure, payload accepte | redirect/deep link provider | tentative metadata/reference | si provider absent, reste en attente locale |
| PSM-003 | P1 | `INITIATED/PENDING -> SUCCEEDED` webhook | Provider | secret/signature, reference, montant devise | ledger, wallet/payout selon cas | `PaymentWebhookEvent`, `PaymentAttempt` | webhooks inconnus conserves sans impact, bon pour audit |
| PSM-004 | P2 | `INITIATED/PENDING -> FAILED/CANCELLED` webhook/status | Provider/backend | reference provider | failureReason | tentative + webhook event | OK |
| PSM-005 | P1 | Wallet checkout `null -> SUCCEEDED` | Rider/backend | wallet existe, solde suffisant, non verrouille | debit wallet atomique, ledger/payout | `WalletTransaction.DEBIT`, `PaymentAttempt.SUCCEEDED` | solide |
| PSM-006 | P1 | `SUCCEEDED -> REFUND_PENDING` | Admin/backend | refund hash idempotent, tentative succeeded | demande provider refund | tentative metadata refund | necessite suivi ops |
| PSM-007 | P1 | `SUCCEEDED/REFUND_PENDING -> REFUNDED` | Provider/backend/admin | hash compatible, provider/refund status | inversion wallet/payout si applicable | transactions refund/reversal | CinetPay refund/status checks limites |
| PSM-008 | P2 | webhook inconnu/conflit | Provider | secret/signature si present | aucun impact metier | `PaymentWebhookEvent` action ignore/conflict | bon pour investigation |

## Idempotence

| Flux | Mecanisme observe | Evaluation |
|---|---|---|
| Checkout | `idempotencyKey` normalisee, `idempotencyHash`, unique `[userId, idempotencyKey]`; replay si hash identique, rejet si mismatch | solide |
| Transaction provider | `transactionRef` unique | solide |
| Provider reference | unique `[provider, providerReference]` | solide, attention null selon SQL |
| Webhook | event conserve avec hash raw body/action; reconciliation idempotente via statut tentative | bon |
| Wallet debit | transaction DB, `wallet.updateMany` avec solde >= montant et wallet non verrouille | solide |
| Refund | hash refund stocke dans metadata, replay si meme hash | solide |
| Wallet reversal | references uniques par wallet | solide si references systematiques |

## Couplage Paiement / Trajet

| Point | Etat observe | Impact |
|---|---|---|
| Demande creee avant paiement | Le Rider cree `RideRequest` puis checkout | un chauffeur peut potentiellement accepter avant confirmation paiement |
| Paiement cash | `Trip.COMPLETED` cree event `CASH_PAYMENT_CONFIRMED` | correct pour terrain, mais audit cash ops necessaire |
| Mobile money | paiement et trip lifecycle ne sont pas strictement verrouilles ensemble | risque de course demarree/terminee avec paiement non confirme |
| Wallet | debit immediate et atomique | meilleur chemin actuel |
| Refund apres payout | service inverse les mouvements wallet/payout si refunded | bon, mais demande monitoring admin |

## Parcours Paiement Normal

1. Rider choisit mobile money ou wallet.
2. `RideRequest` est creee avec montant estime.
3. Rider initialise checkout avec idempotency key.
4. Backend cree `PaymentAttempt.INITIATED`.
5. Provider met en attente ou confirme.
6. Webhook persiste `PaymentWebhookEvent` et reconcilie la tentative.
7. Si `SUCCEEDED`, le parcours peut afficher paiement confirme; apres completion, ledger/payout driver est prepare.

Anomalie majeure: aucun verrou fort observe n'impose "paiement confirme avant acceptation/depart" pour tous les moyens hors cash. Ce choix peut etre volontaire pour marche terrain, mais il doit etre explicite dans les politiques pilote.

## Parcours Remboursement

1. Admin ou service appelle remboursement sur tentative `SUCCEEDED`.
2. Backend construit hash de refund et verifie les replays.
3. Provider refund est appele si disponible.
4. Statut devient `REFUND_PENDING` ou `REFUNDED`.
5. Si rembourse, wallet debit et payout driver sont inverses.
6. Les evenements et metadata gardent la trace d'audit.

Limite: CinetPay indique des operations refund/status non activees dans certains chemins; cela bloque une production multi-provider sans procedure manuelle auditee.

## Parcours Perte Reseau / Session

| Scenario | Etat observe | Evaluation |
|---|---|---|
| Checkout cree puis app fermee | idempotency key peut rejouer si conserve cote client | a verifier cote app pour persistance de la cle |
| Webhook arrive sans app ouverte | backend reconcilie independamment | OK |
| Session expiree avant checkout | session guard refuse, app force reconnexion | OK |
| Provider indisponible | tentative reste en statut non terminal, verification job possible selon provider | besoin de monitoring |
| Refund provider pending | job de verification enqueue selon chemin | OK mais depend config |

## Risques Bloquants

| ID | Gravite | Constat | Impact | Correction recommandee |
|---|---|---|---|---|
| PAY-001 | P1 | Paiement mobile money non strictement couple au cycle trip | course possible sans paiement confirme selon timing | definir politique: preauth obligatoire, cash explicite, ou blocage depart |
| PAY-002 | P1 | Race possible entre `RideRequest.create` et `createCheckoutIntent` si dispatch tres rapide | checkout refuse ou etat incoherent | creer checkout dans meme orchestration que request, ou autoriser init sur `MATCHED` sous conditions |
| PAY-003 | P1 | Provider non configure laisse tentatives en attente | UX et operations bloquées | gate config au demarrage ou fallback clair |
| PAY-004 | P2 | CinetPay refund/status non complet | remboursement manuel necessaire | runbook + audit admin obligatoire avant pilote |
| PAY-005 | P2 | Webhook realtime/notification non essentiel mais monitoring requis | ops peut manquer des echecs | dashboard health/payment alerts |

## Recommandation

Avant pilote limite, Orbi doit choisir une politique paiement explicite par moyen:

- `WALLET`: debit atomique avant dispatch ou avant depart.
- `MOBILE_MONEY`: confirmation obligatoire avant depart, ou reservation courte non demarrable tant que `SUCCEEDED` absent.
- `CASH`: autorise terrain, mais avec confirmation chauffeur, controles support et audit admin.
- `REFUND`: garder l'idempotence actuelle, completer les providers non supportes par procedure admin auditee.
