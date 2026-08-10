# Orbi - Audit machine a etats Trip / RideRequest

Date d'audit: 2026-08-10  
Portee: Prisma schema, `packages/domain`, `RideRequestsService`, `TripsService`, `DispatchCoordinator`, realtime.  
Regle de travail: audit documentaire uniquement.

## Etats Existants

### RideRequest

| Etat | Sens metier | Actif | Source |
|---|---|---|---|
| `REQUESTED` | demande creee, pas encore acceptee | oui | Prisma + domain |
| `MATCHED` | demande reservee/acceptable par chauffeur | oui | Prisma + domain |
| `DRIVER_ARRIVING` | chauffeur affecte et en approche | oui | Prisma + domain |
| `EXPIRED` | demande expiree | non | Prisma + domain |
| `CANCELLED` | demande annulee | non | Prisma + domain |
| `FULFILLED` | demande terminee via trajet | non | Prisma + domain |

### Trip

| Etat | Sens metier | Actif | Source |
|---|---|---|---|
| `MATCHED` | chauffeur a accepte | oui | Prisma + domain |
| `DRIVER_ARRIVING` | chauffeur arrive/approche pickup | oui | Prisma + domain |
| `IN_PROGRESS` | passager a bord, course demarree | oui | Prisma + domain |
| `COMPLETED` | course terminee | non | Prisma + domain |
| `CANCELLED` | course annulee | non | Prisma + domain |

## Transitions Domaine

| Depuis | Vers autorises domaine | Acteurs autorises |
|---|---|---|
| `MATCHED` | `DRIVER_ARRIVING`, `CANCELLED` | Driver/Admin pour arrivee, Rider/Driver/Admin/System selon annulation |
| `DRIVER_ARRIVING` | `IN_PROGRESS`, `CANCELLED` | Driver/Admin pour depart, Rider/Driver/Admin/System selon annulation |
| `IN_PROGRESS` | `COMPLETED`, `CANCELLED` | Rider/Driver/Admin/System selon role policy |
| `COMPLETED` | aucun | aucun |
| `CANCELLED` | aucun | aucun |

## Transitions Observees Bout En Bout

| ID | Gravite | Entite | Transition | Acteur | Validation serveur | Effets secondaires | Evenements temps reel | Ecritures DB | Anomalie |
|---|---|---|---|---|---|---|---|---|---|
| TSM-001 | P1 | RideRequest | `null -> REQUESTED` | Rider | payload, pricing, anti-velocity, pas d'actif Rider | dispatch proactif, promo usage | `ride-request.created` | `RideRequest` | pas de contrainte DB unique active visible |
| TSM-002 | P2 | RideRequest | `REQUESTED/MATCHED -> reservation` | System/dispatch | driver online, approved, position fraiche, vehicule compatible | audit dispatch | `ride-request.reservation-assigned` | `assignedDriverId`, `assignmentExpiresAt` | pas un vrai etat enum; logique implicite |
| TSM-003 | P1 | RideRequest + Trip | `REQUESTED/MATCHED -> Trip.MATCHED` | Driver | driver approved, online, no active trip, fatigue, vehicle compatible, reservation | driver `BUSY`, audit, notification Rider | `trip.created` | `Trip`, `TripEvent.TRIP_ACCEPTED` | solide cote serveur |
| TSM-004 | P2 | Trip/RideRequest | `MATCHED -> DRIVER_ARRIVING` | Driver/Admin | role policy + ownership | notification Rider | `trip.updated` | `TripEvent.DRIVER_ARRIVING`, `RideRequest.DRIVER_ARRIVING` | OK |
| TSM-005 | P0 | Trip | `DRIVER_ARRIVING -> IN_PROGRESS` via `verifyPickupCode` | Driver | ownership + code attendu extrait des events | audit `TRIP_PICKUP_CODE_VERIFIED` | `trip.pickup-code-verified` | status, `startedAt`, event pickup verified | chemin securise existe |
| TSM-006 | P0 | Trip | `DRIVER_ARRIVING -> IN_PROGRESS` via `updateTripStatus` | Driver/Admin | role policy seulement | event `TRIP_STARTED`, `startedAt` | `trip.updated` | status, event lifecycle | contourne la verification pickup code |
| TSM-007 | P0 | Trip | `MATCHED -> IN_PROGRESS` implicite | Driver | transforme l'etat courant en `DRIVER_ARRIVING` pour decision | cree arrivee implicite + depart | `trip.updated` | events `DRIVER_ARRIVING`, `TRIP_STARTED` | depart sans arrivee explicite ni code |
| TSM-008 | P2 | Trip/RideRequest | `IN_PROGRESS -> COMPLETED` | Driver/Rider/Admin/System selon policy | ownership; route review advisory | rideRequest fulfilled, driver status, payout/cash event, notifications | `trip.updated` | status, completedAt, events, rideRequest status | Rider stop anticipe se confond avec completion |
| TSM-009 | P1 | Trip/RideRequest | `MATCHED/DRIVER_ARRIVING/IN_PROGRESS -> CANCELLED` | Rider/Driver/Admin/System | role policy, cancellation policy | support ticket possible, driver status | `trip.updated` | status, cancelledBy, request cancelled | annulation en cours par driver autorisee, doit etre encadree ops |
| TSM-010 | P2 | Trip | route position / incident / SOS | Rider/Driver/System | ownership + actif trip | support tickets, audit logs | `trip.route-position`, `trip.incident-reported`, `trip.sos-triggered` | `TripEvent`, `SupportTicket`, `AuditLog` | couverture solide mais dependante realtime |

## Transitions Interdites

| Transition | Etat observe | Evaluation |
|---|---|---|
| terminal vers actif (`COMPLETED/CANCELLED -> *`) | domaine refuse | OK |
| `MATCHED -> COMPLETED` direct | domaine refuse | OK |
| Rider `MATCHED/DRIVER_ARRIVING -> DRIVER_ARRIVING/IN_PROGRESS` | backend refuse hors annulation | OK |
| Rider `IN_PROGRESS -> CANCELLED` | backend refuse, stop devient `COMPLETED` | OK mais UX doit etre claire |
| Driver autre trajet | `assertDriverOwnsTrip` refuse | OK |
| Rider autre trajet | `assertTripAccess` renvoie not found | OK |
| Driver non valide/offline/accepte sans vehicule | acceptation refusee | OK |
| Driver demarre sans code | actuellement autorise par endpoint generique | P0 |

## Invariants

| Invariant | Verdict | Preuve / commentaire | Gravite |
|---|---|---|---|
| Un passager ne doit avoir qu'une demande ou un trajet actif compatible | Partiellement respecte | `RideRequestsService.create` verifie demandes actives et trips actifs en transaction; schema Prisma n'a que des index, pas de contrainte unique active | P1 |
| Un chauffeur ne recoit que des offres compatibles avec etat, validation, vehicule et position | Partiellement respecte | `getOffers`, proactive dispatch et acceptation filtrent; WebSocket ride-request global et fallback push sont plus larges | P1 |
| Le chauffeur ne doit jamais connaitre le code attendu avant communication passager | Plutot respecte par API retour acceptation, mais a valider presenter detail | `acceptRideRequest` retourne `pickupCode: null`; domaine declare aucune visibilite de code | P1 |
| Le trajet ne doit commencer qu'apres verification serveur du code | Non respecte | `TripsService.updateTripStatus` permet `IN_PROGRESS` sans `verifyPickupCode`; UI Driver l'utilise | P0 |
| Transitions sensibles autorisees cote serveur | Partiellement respecte | role policy centralisee, mais depart implicite depuis `MATCHED` elargit trop | P0 |
| Actions admin sensibles auditees | Majoritairement respecte | nombreux `AuditLog` dans trips/admin/payments/dispatch | P2 pour exhaustivite |

## Realtime

Le service filtre les evenements par role et ids (`canReceiveRealtimeEvent`), mais le WebSocket gateway accepte un message `subscribe` ou le client fournit `role`, `actorId`, `riderId` et `driverId`. Le token est passe dans l'URL par les apps, mais le gateway inspecte surtout le message de souscription et ne reconcilie pas ce filtre avec une session authentifiee dans le code observe.

Impact: un flux REST garde les autorisations, mais le canal temps reel ne doit pas etre considere comme frontiere de securite avant correction.

## Recommandation

Avant beta ou pilote:

1. Supprimer le depart `IN_PROGRESS` de `updateTripStatus` pour Driver/Admin, ou l'interdire sauf preuve `PICKUP_CODE_VERIFIED`.
2. Brancher l'UI Driver sur `verifyPickupCodeWithApi` avec saisie code obligatoire.
3. Authentifier le WebSocket et deriver `role/riderId/driverId` de la session serveur.
4. Ajouter une garantie DB ou verrou transactionnel fort pour l'invariant actif Rider.
5. Rendre explicite la difference entre `RideRequest.MATCHED` reservee et `Trip.MATCHED` acceptee.
