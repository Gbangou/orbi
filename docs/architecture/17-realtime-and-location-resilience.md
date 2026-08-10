# 17 - Resilience Temps Reel et Localisation

Date d'audit: 2026-08-10

Perimetre inspecte et corrige:

- `apps/backend/src/core/realtime/*`
- `apps/backend/src/modules/drivers/*presence*`
- `apps/backend/src/modules/trips/*route-position*`
- `apps/driver-app/lib/use-driver-presence.ts`
- `apps/driver-app/lib/background-location-task.ts`
- `apps/driver-app/lib/driver-presence-signal.ts`
- `packages/ui/src/use-websocket-realtime-stream.ts`
- `packages/api/src/drivers.ts`
- `packages/api/src/trips.ts`

## Synthese

Orbi utilise le temps reel comme accelerateur d'information, pas comme source d'autorite. Les ecrans Rider et Driver declenchent deja une recharge backend apres un evenement realtime. Le backend reste donc la source de verite pour les offres, demandes, trajets, paiements et positions route.

Corrections appliquees:

- Le WebSocket envoie maintenant le token de session dans la souscription et le gateway refuse les souscriptions sans token ou role valide.
- Les messages WS publies incluent `id` et `createdAt`.
- Le hook realtime mobile ignore les evenements dupliques et les evenements plus anciens pour la meme entite.
- Les points GPS Driver trop vieux, trop imprecis ou hors bornes sont rejetes cote mobile avant envoi.
- Le tracking background Driver reutilise le meme validateur de position que le tracking foreground.
- La presence Driver accepte `observedAt` et ignore les positions plus anciennes que la position serveur courante.
- Les payloads route-position acceptent `observedAt` pour conserver l'heure d'observation reelle.

## Strategie Apres Reconnexion

Ordre obligatoire cote mobile:

1. Reouvrir ou restaurer la session.
2. Authentifier les appels API avec le token courant.
3. Recuperer l'etat backend courant: profil, demande active, offre active, trajet actif.
4. Comparer l'etat local avec l'etat backend.
5. Remplacer l'etat local si divergence.
6. Reprendre l'abonnement WebSocket.
7. Utiliser les evenements realtime uniquement pour declencher une nouvelle synchronisation.

## GPS et Tracking

| Cas | Comportement actuel |
|---|---|
| Permission refusee | UI Driver affiche un message fonctionnel; aucun faux point n'est envoye. |
| GPS coupe | UI Driver passe en indisponible; background tracking ne demarre pas sans permission/service. |
| Position ancienne | Rejet mobile si timestamp > 120 s; rejet backend presence si plus ancien que `currentLocationUpdatedAt`. |
| Precision faible | Rejet mobile si precision > 1500 m. |
| Point aberrant | DTO backend borne lat/lng; helper mobile rejette lat/lng hors plage. |
| Application suspendue | Driver background task Expo active avec notification foreground Android. |
| Telephone verrouille | Background location active cote Driver avec stockage securise de l'activeTripId. |
| Changement Wi-Fi/mobile | WebSocket reconnecte avec backoff; les ecrans resynchronisent par API sur evenement. |
| Consommation batterie | Intervalle Driver: 5 s / 25 m en course, 30 s / 120 m hors course; background 15 s / 30 m. |

## Sockets

| Sujet | Etat |
|---|---|
| Heartbeat | Backend ping 30 s; client ping 25 s. |
| Reconnexion | Backoff exponentiel client jusqu'a 30 s. |
| Evenements dupliques | Ignorés cote client par `id`. |
| Evenements hors ordre | Ignorés cote client par `entityId + createdAt`. |
| Autorisation canal | `canReceiveRealtimeEvent` isole rider/driver/admin par role et profil cible. |
| Abonnement incoherent | Souscription WS rejetee si token absent, role inconnu, ou identite minimale absente. |
| Source de verite | Les ecrans rechargent le backend apres update realtime. |

## Securite

Garanties actuelles:

- Les DTO position bornent latitude, longitude, precision et vitesse.
- Les endpoints GPS sont rates limites: presence Driver et route-position.
- Les routes trip verifient l'acces au trajet avant ecriture.
- Les evenements realtime sont filtres avant livraison.
- Les evenements malformes du backplane sont rejetes par `parseRealtimeEvent`.
- Les positions background n'exposent pas les coordonnees a l'UI sous forme technique.

Ecart restant important:

- Le gateway WebSocket exige desormais un token, mais ne verifie pas encore cryptographiquement la session dans le gateway lui-meme. La correction de production cible doit brancher `SessionAuthGuard` ou un validateur de session equivalent au handshake WS, puis deriver `role`, `actorId`, `riderId`, `driverId` du serveur au lieu de les croire depuis le client.

## Conservation

Politique observee:

- Presence Driver: dernier point materialise sur `DriverProfile`.
- Route monitoring: positions conservees comme `TripEvent` pendant la retention du trajet.
- Alertes route: tickets support + audit log.

Politique cible avant production:

- Definir une duree explicite de retention des points route bruts.
- Agreger ou purger les positions anciennes apres cloture et delai support.
- Conserver plus longtemps uniquement les alertes, audits et preuves volontaires necessaires.

## Tests Ajoutes ou Verifies

- `realtime.security.spec.ts`
  - souscription WS sans token rejetee;
  - role inconnu rejete;
  - souscription driver valide conserve son scope.
- `drivers.service.spec.ts`
  - presence plus ancienne ignoree sans ecraser le serveur.
- `driver-presence-signal.test.ts`
  - positions anciennes, imprecises et hors bornes rejetees avant envoi.
- Tests existants verifies:
  - isolation realtime Rider/Driver/Admin;
  - expiry session stream;
  - rate limit route-position;
  - anomalies route: arret prolonge, absence de progres, pickup manque, GPS anomaly.

## Recommandations Avant Pilote

| Gravite | Sujet | Recommandation |
|---|---|---|
| P0 | Auth WS serveur | Valider le token au handshake et deriver les IDs depuis la session/profils backend. |
| P1 | Retention GPS | Ajouter une politique de retention/purge des `TripEvent` de position brute. |
| P1 | Reconciliation post-reconnect | Centraliser un helper mobile `resyncAfterRealtimeReconnect()` par app. |
| P2 | Batterie terrain | Mesurer sur Android entree/milieu de gamme et ajuster background interval si chauffe/drain. |
| P2 | Precision faible persistante | Ajouter un statut serveur dedie `LOW_ACCURACY` pour que dispatch degrade proprement. |

Etat apres correction: plus robuste pour tests internes et field test controle. Pas encore pret pour production tant que l'authentification WS n'est pas verifiee cote serveur au handshake.
