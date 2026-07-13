# Orbi Deployment Runbook

Ce document decrit la strategie de deploiement prudente pour Orbi lorsqu'il y a:

- des utilisateurs connectes
- des trajets en cours
- des paiements et de l'argent en circulation
- plusieurs instances backend

## Objectif

Faire des mises a jour sans interruption brutale, sans double traitement, et sans casser les flux critiques.

## Fondations deja en place

- endpoint `GET /api/v1/health/live`
- endpoint `GET /api/v1/health/ready`
- endpoint `GET /api/v1/health` avec `operations.serviceLevelObjectives`
  pour SLO, burn-rate, owners et taxonomie d erreurs mobile
- endpoint admin `GET /api/v1/admin/launch-readiness` pour la decision de pilote production
- etat runtime `starting -> ready -> draining -> stopped`
- refus automatique des nouvelles requetes applicatives quand une instance n'est pas prete ou entre en drainage
- shutdown gracieux pilote par `GRACEFUL_SHUTDOWN_TIMEOUT_MS`
- pagination bornee sur plusieurs endpoints sensibles
- rate limiting et temps reel abstraits derriere des adapters configurables

## Strategie de deploiement recommandee

1. Utiliser au moins deux instances backend derriere un load balancer.
2. Configurer le load balancer pour router uniquement vers les instances dont `health/ready` retourne HTTP 200.
3. Lors d'un rolling deploy:
   - demarrer la nouvelle version
   - attendre `health/ready = ready`
   - basculer progressivement le trafic
   - envoyer `SIGTERM` a l'ancienne instance
   - laisser l'instance passer en `draining`
   - laisser le load balancer l'exclure
   - attendre la fermeture gracieuse

## Regle de migration base de donnees

Ne jamais deployer une migration destructive en meme temps qu'une version applicative encore compatible avec l'ancien schema.

Utiliser la strategie `expand -> migrate traffic -> contract`:

1. `Expand`
   - ajouter colonnes/tables/index sans supprimer l'ancien schema
   - rendre la nouvelle version backward compatible
2. `Migrate traffic`
   - deployer le nouveau code
   - verifier readiness, logs, paiements, flux critiques
   - backfill des donnees si necessaire
3. `Contract`
   - supprimer ancien schema seulement quand toutes les instances utilisent le nouveau code

## Paiements et argent

- tout traitement webhook doit etre idempotent
- tous les POST argent declenches par mobile doivent transmettre une
  `Idempotency-Key` stable par intention utilisateur: checkout intent, wallet
  top-up, remboursement ou ajustement wallet cote ops
- les remboursements admin doivent aussi transmettre une `idempotencyKey` et
  conserver le meme motif lors d un retry; une meme cle avec un motif different
  doit etre traitee comme incident d usage, pas comme nouveau remboursement
- ne jamais lier une mise a jour critique de paiement a un seul process en memoire
- preferer des traitements rejouables et journalises
- avant chaque pilote ou release argent, ouvrir la console admin section
  paiements et verifier le dashboard finance: `refund pending`, `wallet
  recovery`, `payout backlog`, `webhook ignored` et `reconciliation age` doivent
  avoir un owner et une action claire avant d accepter du trafic reel
- verifier dans le journal webhooks que les recharges wallet PawaPay apparaissent
  en `persisted_wallet_top_up_credited`, `persisted_wallet_top_up_failed` ou
  `persisted_wallet_top_up_replay`; un top-up wallet ne doit jamais rester en
  `ignored_unknown_reference`
- conserver le `settlement_batch_id` des exports payouts chauffeur dans le
  registre finance terrain; il doit etre identique entre CSV/PDF pour le meme
  lot et servir de reference de rapprochement
- avant de passer en trafic argent reel, verifier `launch-readiness`: le check
  `payment-production-gate` doit etre vert ou explicitement reconnu avec owner
  finance, et ses causes doivent correspondre au dashboard finance
- en production multi-instance, brancher les adapters `rate limit` et `realtime` sur le backplane PostgreSQL partage: `RATE_LIMIT_ADAPTER=postgres`, `REALTIME_ADAPTER=postgres`, `RATE_LIMIT_STRICT=true`, `REALTIME_STRICT=true`
- verifier que la job queue durable traite `DRIVER_RESERVATION_EXPIRY`: le timer ne fait qu enqueuer un job deduplique et le worker partage execute le sweep avec verrou PostgreSQL

## Temps reel

Aujourd'hui, le backend fournit une base SSE, un transport in-memory pour le
local, et un transport PostgreSQL `LISTEN/NOTIFY` pour les instances partagees.

Pour la vraie production multi-instance:

1. garder la meme interface applicative
2. configurer `REALTIME_ADAPTER=postgres` et `REALTIME_STRICT=true`
3. connecter rider, driver et admin a des flux live partageant la meme source d'evenements
4. verifier que les flux SSE se ferment a l expiration de session et que les
   clients mobiles reconnectent apres renouvellement auth

## Garde-fous de deploiement realtime

- `REALTIME_ADAPTER=in-memory` reste acceptable pour le dev local et les previews mono-instance
- `REALTIME_ADAPTER=postgres` utilise `DATABASE_URL` comme backplane partage multi-instance
- `REALTIME_ADAPTER=redis` n est pas encore implemente et reste refuse au demarrage production
- `REALTIME_STRICT=true` est obligatoire en production pour faire echouer la readiness d une instance qui demarrerait avec un fallback non partage

Cela evite un faux sentiment de securite ou une prod multi-instance tournerait par erreur en transport local non partage.

## Garde-fous de deploiement rate limit

- `RATE_LIMIT_ADAPTER=in-memory` reste acceptable pour le dev local et les previews mono-instance
- `RATE_LIMIT_ADAPTER=postgres` utilise `DATABASE_URL` pour compter les limites entre instances
- appliquer les migrations avant trafic: `orbi_rate_limit_counters` doit
  exister avant d activer le store partage
- `RATE_LIMIT_ADAPTER=redis` n est pas encore implemente et reste refuse au demarrage production
- `TRUST_PROXY=true` doit etre active uniquement quand l API est derriere un
  proxy/load balancer de confiance; le rate limit IP utilise `request.ip`, pas
  un en-tete `x-forwarded-for` fourni directement par le client, et HSTS se
  base sur le marqueur HTTPS fiable d Express
- `RATE_LIMIT_STRICT=true` est obligatoire en production pour faire echouer la readiness d une instance qui demarrerait avec un fallback non partage

Cela evite qu un cluster multi-instance expose des limites incoherentes selon les noeuds, ce qui degrade la securite et la stabilite sous charge.

## Checklist avant de deployer

- `pnpm test:production:gate`
- GitHub Actions `Production Readiness Gate` vert sur la branche candidate
- `pnpm typecheck`
- `pnpm --filter backend test -- --runInBand`
- verifier que `DATABASE_URL` authentifie reellement contre PostgreSQL avant toute migration Prisma
- verifier que `NODE_ENV=production` demarre avec des secrets explicites, jamais
  les valeurs de dev:
  - `PAYMENTS_WEBHOOK_SECRET`
  - `DOCUMENT_SIGNING_SECRET`
  - `PAYMENTS_DEFAULT_REDIRECT_URL`
  - `PAYMENTS_DEFAULT_WEBHOOK_URL`
- verifier que les URLs publiques de production ne contiennent pas `localhost`
- verifier que `TRUST_PROXY=true` correspond a une topologie avec proxy fiable,
  et rester a `false` si l API est exposee directement
- si `RATE_LIMIT_STRICT=true`, utiliser `RATE_LIMIT_ADAPTER=postgres` avec une
  `DATABASE_URL` valide, ou attendre l implementation Redis avant de choisir
  `RATE_LIMIT_ADAPTER=redis`
- si `REALTIME_STRICT=true`, utiliser `REALTIME_ADAPTER=postgres` avec une
  `DATABASE_URL` valide, ou attendre l implementation Redis avant de choisir
  `REALTIME_ADAPTER=redis`
- si `PAYMENTS_REFUND_MODE=provider` avec Flutterwave,
  `FLUTTERWAVE_SECRET_KEY` doit etre configure
- consulter `GET /api/v1/admin/launch-readiness` avec un compte admin/ops:
  - `decision.state=blocked`: ne pas ouvrir de pilote production
  - `decision.state=limited`: pilote encadre seulement, sans montee en charge
  - `decision.state=approved`: pilote production possible avec supervision active
- traiter les entrees `nextActions` avant extension du pilote:
  - `severity=blocking`: owner obligatoire avant toute ouverture production
  - `severity=warning`: acceptable uniquement avec pilote limite et suivi actif
- utiliser `POST /api/v1/admin/launch-readiness/actions/:checkId/acknowledge`
  pour tracer l owner et la prise en charge dans l audit log; cela ne rend pas
  le check vert automatiquement
- les acknowledgements visibles dans `launch-readiness.acknowledgements` viennent
  des audit logs et survivent aux refreshs de console
- les consoles admin resynchronisent automatiquement `launch-readiness` quand
  une autre console prend une action ou quand le health watchdog publie une
  alerte/recuperation
- surveiller `launch-readiness.actionSummary`:
  - `remainingBlockingActions > 0`: pas d'ouverture production
  - `remainingActions > 0`: pilote limite uniquement, avec owners visibles
  - `completionRate=100`: toutes les actions actives ont un owner audite
- surveiller `launch-readiness.safetyBenchmark`:
  - `criticalGaps > 0`: pas d'extension large hors pilote limite, meme si le
    runtime est vert
  - `competitorParityRate < 80`: prioriser les capacites securite visibles par
    Uber/Bolt/Yango avant marketing ou croissance
  - `criticalGaps = 0` et `competitorParityRate >= 80`: le lancement depend
    surtout des signaux runtime/ops/argent, plus d un gap securite critique
- migrations relues en mode `expand-contract`
- rollback plan prepare
- secrets/env verifies
- monitoring, logs et alertes actifs

## Securite et benchmark concurrents

Le launch gate compare Orbi aux standards visibles des leaders VTC:

- Uber met en avant Emergency Button, Safety Toolkit, Share My Trip, RideCheck,
  Verify Your Ride/PIN, contacts d'urgence, anonymisation telephone et audio
  recording selon marche.
- Bolt met en avant pickup codes, Emergency Assist, Share Location, Trusted
  Contacts, Ride Check, verification identite, assurance et limites de shift.
- Yango met en avant SOS, route sharing, route monitoring, driver/document
  verification, support, in-app calls, conflict button et shift control selon
  pays.

Orbi expose maintenant un SOS in-app cote rider et driver: l action force un
ticket support P3, ecrit un event `SOS_TRIGGERED` dans la timeline trip, publie
`trip.sos-triggered` en temps reel, journalise `TRIP_SOS_TRIGGERED` dans
l audit log et ouvre l appel local `112` depuis l app mobile quand le device le
permet.

Orbi expose aussi un lien de partage trajet depuis rider et driver:
`POST /api/v1/trips/:tripId/share-link` cree un token a duree courte, stocke
uniquement son hash dans l event `SHARE_LINK_CREATED`, journalise
`TRIP_SHARE_LINK_CREATED`, publie `trip.share-link-created`, puis permet a un
proche de consulter `GET /api/v1/trips/shared/:shareToken` avec seulement les
informations utiles de securite. Le lien public n expose aucun numero personnel
et expire automatiquement.

Orbi expose maintenant le premier socle route monitoring:
`POST /api/v1/trips/:tripId/route-position` journalise une position bornee dans
`ROUTE_POSITION_RECORDED`, compare le signal au corridor pickup-destination et
aux derniers pings, puis cree une alerte `ROUTE_MONITORING_ALERT` avec ticket
support si une deviation, un arret long, une absence de progression, un saut GPS
impossible ou un pickup suspect est detecte. Le signal `PICKUP_MISMATCH` se
declenche seulement sur une course encore `MATCHED`, apres la periode de grace,
quand le chauffeur reste trop loin du point de depart; ce seuil doit etre
calibre avec le pilote terrain. L alerte est auditee via
`TRIP_ROUTE_MONITORING_ALERT_CREATED`, publiee en temps reel avec
`trip.route-monitor-alert`, et visible dans Live Ops. Live Ops affiche aussi le
progres depart/destination a partir du dernier signal chauffeur disponible,
qualifie chaque trajet avec `signalState` (`fresh`, `stale`, `missing`) et
compte `staleDriverSignals` dans le resume ops, sans exposer les coordonnees
brutes; un ping rider plus recent ne remplace pas la position vehicule cote
operations. Les alertes sont refroidies par type pour eviter le spam support.

Orbi expose aussi un socle extensible de contacts de confiance cote rider:
`PATCH /api/v1/riders/trusted-contact` accepte uniquement un numero Burkina
borne au format `+226XXXXXXXX`, un mode `MANUAL`, `NIGHT` ou `ALL_TRIPS`, puis
met a jour `RiderProfile.emergencyPhone` et le mode persistant
`trusted_contact_share_mode`, synchronise le contact actif principal dans
`rider_trusted_contacts`, puis journalise `RIDER_TRUSTED_CONTACT_UPDATED`. La
reponse profil expose `trustedContact` pour compatibilite mobile et
`trustedContacts[]` pour la suite multi-contacts auditee. L ecran compte rider
rend le contact principal visible, modifiable, desactivable, affiche la liste
des contacts actifs avec numeros masques, puis permet d ajouter, prioriser et
retirer un contact depuis l app.
`POST /api/v1/riders/trusted-contacts`,
`PATCH /api/v1/riders/trusted-contacts/:trustedContactId` et
`DELETE /api/v1/riders/trusted-contacts/:trustedContactId` permettent de gerer
jusqu a trois contacts actifs, leur ordre de priorite et leur desactivation
douce; chaque changement resynchronise le contact principal et ecrit un audit.
Quand le mode est `ALL_TRIPS`, ou `NIGHT` sur plage nocturne, l acceptation
chauffeur choisit le premier contact actif par priorite, prepare
automatiquement un lien de partage trajet audite avec
`TRIP_TRUSTED_CONTACT_SHARE_PREPARED` et un event `SHARE_LINK_CREATED` marque
`TRUSTED_CONTACT_AUTO_SHARE`. Le prochain palier production consiste a brancher
SMS/WhatsApp/provider sans exposer de donnees personnelles dans le lien public
de trajet.

Orbi impose maintenant un premier garde-fou fatigue chauffeur. Avant mise en
ligne et avant acceptation d une mission, le backend calcule les courses
terminees et minutes de conduite sur une fenetre glissante de 8h. Au-dela de 8
courses terminees ou 300 minutes de conduite, une pause de 30 minutes est
requise: `DRIVER_FATIGUE_AVAILABILITY_BLOCKED` ou
`DRIVER_FATIGUE_TRIP_ACCEPTANCE_BLOCKED` est audite, et le driver voit le signal
fatigue dans son cockpit offres. Les seuils doivent etre calibres avec le pilote
terrain, surtout par chaleur, nuit et type de vehicule.

Orbi expose enfin une declaration de preuve incident volontaire:
`POST /api/v1/trips/:tripId/report-incident` accepte `evidenceConsent`,
`evidenceType` (`AUDIO`, `PHOTO`, `VIDEO`, `TEXT_NOTE`) et
`evidenceRetentionHours` borne a 72h. Si le consentement est explicite, la
timeline recoit `INCIDENT_EVIDENCE_DECLARED`, l audit log recoit
`TRIP_INCIDENT_EVIDENCE_DECLARED`, et le ticket support mentionne que la preuve
reste locale jusqu a upload explicite. Aucun fichier n est envoye
automatiquement. La reponse API et l audit log portent aussi `expiresAt`, calcule
sur une retention bornee a 1h-72h dans la couche service meme si l appel contourne
la validation DTO.

Les surfaces mobiles sensibles utilisent aussi la protection anti-capture native:
authentification rider/driver, booking/paiement, recherche vocale, activite,
compte, recu, onboarding chauffeur, cockpit, offres, profil et revenus. Les
tests de couverture `screen-privacy` doivent rester verts avant pilote terrain.

Orbi ne doit pas copier aveuglement ces produits. La regle de production est
plus stricte: une capacite securite n est consideree comme concurrentielle que
si elle est visible dans le parcours rider/driver, auditable par les ops, et
degradee proprement quand le temps reel, le support ou le provider externe ne
repond pas.

## Checklist apres deploiement

- `health/live` et `health/ready` verts
- `health.operations.serviceLevelObjectives.posture = healthy` ou decision
  explicite de pilote limite si `watch`
- aucune entree SLO en `fail`; les objectifs `warn` ont un owner et une action
  dans le runbook ou le board launch-readiness
- `admin/launch-readiness.fieldQuality.state` vaut `excellent` pour une
  ouverture large; `watch` impose un pilote limite avec owner visible;
  `blocked` interdit l extension terrain
- verification creation de session
- verification demande de course
- verification acceptation chauffeur
- verification paiement initialise
- verification ticket support et flux live
