# Orbi - Parcours bout en bout Rider

Date d'audit: 2026-08-10  
Portee: `apps/rider-app`, `packages/api`, `packages/domain`, `apps/backend`, Prisma.  
Regle de travail: audit documentaire uniquement, aucune modification applicative.

## Synthese

Le parcours Rider est utilisable en developpement local et partiellement coherent avec le backend: creation de demande, garde-fou "une demande ou un trajet actif", annulation, suivi actif, incidents, SOS, notation et historique existent. Les ecarts les plus serieux sont la dependance a du temps reel WebSocket auto-declare, l'absence de contrainte DB unique pour l'invariant actif Rider, et un risque de course entre creation de demande et paiement mobile money si la demande passe `MATCHED` avant l'initialisation du paiement.

Verdict parcours Rider: pret pour tests internes, pas pret pour pilote limite tant que les invariants temps reel, paiement et demarrage securise du trajet ne sont pas verrouilles bout en bout.

## Parcours Normal Rider

| Etape | Ecran / module | Action Rider | Backend / DB | Temps reel | Etat attendu | Anomalies |
|---|---|---|---|---|---|---|
| 1 | Lancement / layouts Expo | Restaure la session locale | `restoreRiderSession`, `auth/me` | Aucun requis | session valide ou redirection auth | Reprise dependante du token local; UX geree mais peu de mode degrade metier |
| 2 | Onboarding / auth / OTP | Se connecter ou creer session | Auth NestJS, `User`, `Session`, `RiderProfile` | Aucun requis | role `RIDER`, profil charge | Les erreurs techniques sont masquees cote app, bon pour UX; besoin d'audit auth separe |
| 3 | Permissions | Autoriser localisation / notifications | Push token via API users | Push | permissions connues | Pas de blocage metier fort si localisation degradee |
| 4 | Accueil / recherche destination | Choisir pickup/destination/service | Donnees locales + API pricing/options | Aucun requis | devis affiche | Certaines options viennent de fixtures de preview dans `packages/api/src/routes.ts` |
| 5 | Demande course | Confirmer la course | `RideRequestsService.create` cree `RideRequest` | `ride-request.created`, reservation possible | `RideRequest.REQUESTED` ou reservation driver | Invariant actif verifie en transaction mais sans contrainte DB unique par statut actif |
| 6 | Paiement mobile money / wallet | Initialiser checkout | `PaymentsService.createCheckoutIntent`, `PaymentAttempt` | Webhook plus tard | `INITIATED/PENDING/SUCCEEDED` | Race possible si la demande est acceptee avant l'appel paiement, car l'init paiement n'accepte que certains statuts |
| 7 | Recherche chauffeur | Attendre assignation | Dispatch proactif + fallback notification | `ride-request.reservation-assigned`, `trip.created` | demande reservee puis trajet cree | Le WebSocket laisse le client declarer ses filtres; la securite repose sur filtre applicatif non authentifie au handshake |
| 8 | Chauffeur trouve | Voir chauffeur et infos trajet | `TripsService.acceptRideRequest` cree `Trip` | `trip.created` | `Trip.MATCHED`, chauffeur `BUSY` | OK cote serveur pour ownership et compatibilite a l'acceptation |
| 9 | Chauffeur arrive / code | Communiquer le code pickup | `TripEvent.PICKUP_CODE_ISSUED` lu par presenter | `trip.updated` | `Trip.DRIVER_ARRIVING`, code visible Rider seulement | Le domaine declare `pickupCodeVisibleTripLifecycleStatuses = []`, alors que les tests Rider attendent un code; verifier presenter reel |
| 10 | Trajet | Suivre progression, incident/SOS | `TripEvent.ROUTE_POSITION_RECORDED`, `SupportTicket`, audit logs | `trip.route-position`, `trip.incident-reported`, `trip.sos-triggered` | `Trip.IN_PROGRESS` | Le demarrage peut etre applique par endpoint generique chauffeur sans verification du code, ce qui affecte aussi le Rider |
| 11 | Arrivee destination | Fin / stop anticipé | `updateTripStatus` vers `COMPLETED` | `trip.updated` | `Trip.COMPLETED`, `RideRequest.FULFILLED` | Rider peut stopper un trajet en cours; serveur calcule ajustement, ticket support possible |
| 12 | Recu / notation | Consulter recu, noter | `ratings`, support quality review possible | `support-ticket.updated` si note faible | historique enrichi | `apps/rider-app/app/receipt.tsx` contient un `pickupCode: '5621'` de demonstration a surveiller |

## Parcours Paiement

| Phase | Etat / ecriture | Validation | Effet secondaire | Risque |
|---|---|---|---|---|
| Selection moyen | `RideRequest.paymentMethod` | enum Prisma `MOBILE_MONEY`, `CASH`, `WALLET` | Prix et instruction UI | Cash autorise; reconciliation terrain necessaire |
| Checkout mobile money | `PaymentAttempt.INITIATED` | session Rider, idempotency key, hash stable | Appel provider si configure | Si provider non configure, tentative persiste sans progression automatique |
| Wallet | `Wallet.balance` decrement + `WalletTransaction.DEBIT` + tentative `SUCCEEDED` | solde suffisant, wallet non verrouille | ledger/payout apres transaction | Correctement atomique, mais dépend de reference unique wallet |
| Webhook | `PaymentWebhookEvent`, tentative mise a jour | secret/signature provider | reconciliation et audit indirect | Les evenements inconnus sont conserves, pas bloques |
| Course terminee | event paiement cash ou payout driver | statut trip `COMPLETED` | notifications | Paiement mobile money et cycle trip ne sont pas strictement couples |

## Parcours Remboursement

Le remboursement est principalement admin/backend, pas un flux Rider self-service complet. `PaymentsService.refundPaymentAttempt` verifie que la tentative est `SUCCEEDED`, utilise un hash d'idempotence de remboursement, passe par le provider quand disponible et inverse les mouvements wallet/payout si le statut final est `REFUNDED`. CinetPay annonce des limitations de refund/status checks; les operations manuelles doivent rester visibles dans l'admin.

## Parcours Annulation

| Situation | Endpoint | Autorisation | Resultat | Anomalie |
|---|---|---|---|---|
| Demande non acceptee | `RideRequestsService.cancel` | Rider proprietaire | `RideRequest.CANCELLED` | OK, ticket support si annulations repetees |
| Trajet pre-depart | `TripsService.updateTripStatus(..., CANCELLED)` | Rider proprietaire | `Trip.CANCELLED`, `RideRequest.CANCELLED`, driver status recalculé | Politique frais/support existe |
| Trajet en cours | Rider ne peut pas annuler, mais peut `COMPLETED` | role policy domaine | stop anticipe, ajustement tarifaire | UX doit eviter de presenter cela comme une simple annulation |

## Parcours Support

Le support Rider existe par incidents actifs, SOS, annulations avec revue, notes faibles et admin support tickets. Les ecritures importantes creent `SupportTicket`, `TripEvent`, `AuditLog` et notifications support. Le parcours support general hors trajet reste moins clair dans les ecrans mobiles et devrait etre consolide avec l'etat des tickets.

## Reprises et Modes Degrades

| Scenario | Comportement observe | Backend implique | Evaluation |
|---|---|---|---|
| Fermeture app | session locale restauree puis fetch des demandes/trajets actifs | auth/me, trips/requests | acceptable pour tests internes |
| Perte reseau | erreurs transformees par `resolveRiderAppError`, polling/refresh manuel possible | endpoints REST | pas de file offline pour actions sensibles |
| Expiration session | feedback demande reconnexion et peut effacer token local | session guard | correct mais pas de reprise transactionnelle |
| Temps reel indisponible | app depend des refreshs et fetchs historiques | `RealtimeService` degrade possible | acceptable local, insuffisant pilote si WS reste non authentifie |
| Aucun chauffeur disponible | demande reste `REQUESTED`, dispatch audit no candidate | dispatch proactif + fallback broadcast | besoin UX explicite: attente, changer service, annuler, support |

## Invariants Rider

| Invariant | Etat observe | Gravite |
|---|---|---|
| Un passager ne doit avoir qu'une demande ou un trajet actif compatible | Verifie dans `RideRequestsService.create` par transaction et statuts actifs; pas de contrainte DB partielle visible | P1 |
| Le code attendu ne doit pas etre connu du chauffeur | Presenter retourne `pickupCode: null` a l'acceptation et verification separee existe | P0/P1 car l'endpoint generique chauffeur contourne la verification |
| Le trajet commence apres verification serveur du code | Non garanti bout en bout a cause de `updateTripStatus(..., IN_PROGRESS)` | P0 |
| Paiements idempotents | Checkout, wallet et refund ont des cles/hashes; webhooks conserves | P1 |
| Reprise apres perte reseau | UX de recuperation existe, mais pas de journal local d'actions sensibles | P2 |
