# Orbi - Parcours bout en bout Driver

Date d'audit: 2026-08-10  
Portee: `apps/driver-app`, `packages/api`, `packages/domain`, `apps/backend`, Prisma.  
Regle de travail: audit documentaire uniquement, aucune modification applicative.

## Synthese

Le parcours Driver couvre l'essentiel: onboarding, disponibilite, offres, acceptation, navigation vers pickup, arrivee, demarrage, fin, revenus, wallet, support et documents. Le backend est plus robuste que l'UI sur la compatibilite des offres, mais deux ecarts bloquent un pilote: le demarrage du trajet contourne l'endpoint de verification du code, et le WebSocket accepte des abonnements declaratifs sans authentification serveur du token de connexion.

Verdict parcours Driver: pret pour tests internes encadres; non pret pour beta/pilote sans correction du demarrage par code et de l'autorisation realtime.

## Parcours Normal Driver

| Etape | Ecran / module | Action Driver | Backend / DB | Temps reel | Etat attendu | Anomalies |
|---|---|---|---|---|---|---|
| 1 | Lancement | Restaurer session chauffeur | `restoreDriverSession`, `auth/me` | aucun requis | session `DRIVER` et profil charge | Reconnexion OK, mais pas de reprise metier locale des actions sensibles |
| 2 | Onboarding identite/documents/vehicule | Completer profil | `DriverProfile`, `Vehicle`, documents | admin events possibles | profil `APPROVED` requis pour offres | Upload/verifications documentaires restent a renforcer avant pilote |
| 3 | Disponibilite | Passer online/offline | `DriverProfile.status`, position fraiche | presence indirecte | `ONLINE` + position recente | Les offres ne sortent pas si position stale, bon garde-fou |
| 4 | Reception offres | Voir offres compatibles | `DispatchCoordinator.getOffers` | `ride-request.created/reservation-assigned` | offres `REQUESTED/MATCHED` compatibles | Realtime `ride-request` sans `driverId` est visible par tout role driver abonne; filtrage offre REST reste plus strict |
| 5 | Acceptation | Accepter une offre | `TripsService.acceptRideRequest` | `trip.created` | `Trip.MATCHED`, driver `BUSY` | Serveur verifie `APPROVED`, `ONLINE`, absence de trajet actif, vehicule compatible |
| 6 | Refus | Decliner une offre | dispatch decline/release | `ride-request.reservation-released` | offre retiree | Cooldown decline existe; comportement UX a tester terrain |
| 7 | Navigation pickup | Se rendre au passager | route client + `recordRoutePosition` | `trip.route-position` | `MATCHED` puis `DRIVER_ARRIVING` | La route safety est advisory, pas bloquante |
| 8 | Arrivee | Marquer arrive | `updateTripStatus(..., DRIVER_ARRIVING)` | `trip.updated` | `DRIVER_ARRIVING`, notification Rider | OK |
| 9 | Code / depart | Demarrer course | UI appelle `updateTripStatus(..., IN_PROGRESS)` | `trip.updated` | `IN_PROGRESS` | Critique: n'appelle pas `verifyPickupCodeWithApi`; code serveur peut etre contourne |
| 10 | Trajet | Naviguer destination | positions route + statut | `trip.route-position` | `IN_PROGRESS` | Pas de blocage client si GPS absent; backend genere revues support selon signaux |
| 11 | Fin | Terminer course | `updateTripStatus(..., COMPLETED)` | `trip.updated` | `COMPLETED`, `RideRequest.FULFILLED`, driver status recalculé | Payout calcule; cash confirme par event |
| 12 | Revenus/wallet/retraits | Consulter gains | wallet, payouts, top-ups | admin/payment events | solde et historique | Retraits et reconciliation doivent rester operationnels avant pilote |

## Offres Compatibles

| Condition | Controle serveur observe | Resultat |
|---|---|---|
| Chauffeur approuve | `verificationStatus: APPROVED` dans dispatch et acceptation | solide |
| Chauffeur online | `status: ONLINE` avant offres et acceptation | solide |
| Position fraiche | latitude/longitude et `currentLocationUpdatedAt` recentes | solide |
| Vehicule actif compatible | type/tier filtre dans dispatch, getOffers et acceptation | solide |
| Aucun trajet actif | `ACTIVE_TRIP_STATUSES` bloque acceptation | solide |
| Reservation | `assignedDriverId` et `assignmentExpiresAt` verifies atomiquement | solide |
| Notification fallback | `RideRequestsService.broadcastToOnlineDrivers` cible online/position/session, mais pas explicitement type/tier | P2: notification possible a un chauffeur qui ne pourra pas accepter |

## Parcours Annulation / Refus

Le refus d'offre passe par le dispatch et peut relacher une reservation. L'annulation d'un trajet accepte passe par `TripsService.updateTripStatus(..., CANCELLED)`. Le domaine autorise le chauffeur a annuler depuis `MATCHED`, `DRIVER_ARRIVING` et `IN_PROGRESS`; le backend ouvre une revue support si annulations chauffeur repetees. Le statut chauffeur est ensuite reconstruit par `buildDriverStatusUpdate`.

## Parcours Paiement et Revenus

Le chauffeur n'encaisse directement que le cash. Pour mobile money/wallet, le flux paiement est Rider/backend; le chauffeur voit confirmation et revenus apres completion. `calculateDriverEconomics` prepare payout, des notifications driver sont envoyees en fin de trajet, et les remboursements peuvent inverser les mouvements wallet/payout. Le couplage "paiement reussi avant course" n'est pas strictement impose par la machine trip.

## Parcours Support

Le chauffeur peut declarer incident actif; le backend cree `SupportTicket`, `TripEvent` et `AuditLog`. Les annulations repetees, route alerts, notes faibles et compensations support sont visibles cote admin. Les ecrans Driver support/documents expirés/suspension existent comme surfaces produit, mais l'audit complet de leur couverture endpoint par endpoint reste a consolider dans une passe fonctionnelle.

## Reprises et Modes Degrades

| Scenario | Comportement observe | Evaluation |
|---|---|---|
| Fermeture app | session locale restauree, fetch offres/trajets/revenus | acceptable local |
| Perte reseau pendant depart | l'app tente `recoverStartedTripAfterFailedUpdate` en refetchant le trip | utile, mais renforce le contournement actuel du code |
| Expiration session | `resolveDriverAppError` peut vider le token et demander reconnexion | acceptable |
| GPS absent/stale | offres masquees et route review possible | bon garde-fou |
| Aucun passager/offre | liste vide / attente | UX a rendre plus explicite pour terrain |

## Invariants Driver

| Invariant | Etat observe | Gravite |
|---|---|---|
| Recevoir uniquement offres compatibles avec etat, validation, vehicule, position | `getOffers` et acceptation sont stricts; push fallback moins precis | P1/P2 |
| Ne jamais connaitre le code attendu avant communication passager | API expose `pickupCode` nullable, acceptation retourne null; a verifier dans presenter detail | P1 |
| Demarrer seulement apres verification serveur du code | Non respecte: UI et backend generique permettent `IN_PROGRESS` sans `verifyPickupCode` | P0 |
| Transitions sensibles autorisees serveur | role policy existe, mais inclut depart implicite chauffeur depuis `MATCHED` | P0 |
| Actions support/admin auditees | nombreuses ecritures audit/support presentes | P2 pour exhaustivite |
