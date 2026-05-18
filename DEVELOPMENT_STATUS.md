# Orbi Development Status

Date de reference: 18 mai 2026

## Etat court

Orbi dispose d'une fondation locale serieuse: monorepo pnpm, backend NestJS
+ Prisma, apps Expo rider/driver, admin Next.js, contrats TypeScript partages,
authentification session, RBAC, validation DTO, audit logs, health/readiness,
pricing Burkina, paiements/wallet foundations, onboarding chauffeur securise et
smokes locaux.

Le produit n'est pas encore une production large. Le bon objectif actuel reste
un pilote terrain controle avec operations manuelles de secours, preuves de
paiement provider, observabilite et runbooks verts.

## Snapshot MVP / Production - 18 mai 2026

Mesure locale du repo suivi par Git, hors `node_modules`, `.next`, `dist`,
`coverage`, `.expo` et artefacts de build:

| Mesure | Valeur |
| --- | ---: |
| Fichiers suivis mesures | 430 |
| Lignes totales repo suivies | 94 817 |
| Lignes code/config executable principales | 76 562 |
| Backend NestJS/Prisma | 41 246 |
| Admin web Next.js | 11 969 |
| Rider app Expo | 9 166 |
| Driver app Expo | 8 925 |
| Contrat API partage | 3 466 |
| Domaine partage | 655 |

Evaluation produit actuelle:

| Niveau | Etat | Lecture |
| --- | --- | --- |
| Prototype UI | Depasse | Les surfaces rider, driver, admin, backend et contrats existent. |
| MVP local | Avance | Les parcours auth, booking, driver, paiement local, admin ops, health, jobs et smokes sont testables. |
| MVP terrain controle | Proche, pas encore signe | Il faut repeter sessions appareils reels, DB reelle, provider sandbox paiement/refund et runbook ops. |
| Production pilote limitee | En preparation | Les garde-fous existent, mais il manque preuves preprod/cloud, observabilite externe, secrets, rollback et validations legales/ops. |
| Production large type Uber/Yango/Bolt | Pas encore | Necessite charge, pentest externe, SOC/IR, resilience multi-zone, support terrain, fraude GPS/paiement a l echelle et preuves marche. |

En pourcentage pragmatique, Orbi est environ:

- 75-85% d'un MVP local technique credible;
- 55-65% d'un pilote terrain controle;
- 30-40% d'une production limitee exploitable avec clients reels;
- 10-20% d'une plateforme VTC mature a grande echelle.

Ces pourcentages ne mesurent pas seulement le code. Ils mesurent aussi les
preuves manquantes: usage terrain, fournisseurs reels, cloud, monitoring,
support, legal, securite offensive et resilience.

Ordres de grandeur des competiteurs: les lignes de code exactes d'Uber, Lyft,
Bolt ou Yango ne sont pas publiques et changent en continu. Une plateforme VTC
globale mature represente generalement des millions a dizaines de millions de
lignes si l'on inclut apps mobiles, backend, data, ML/fraude, cartes, paiements,
outils internes, infra, tests et services historiques. Le bon benchmark pour
Orbi maintenant n'est donc pas le nombre brut de lignes, mais la couverture des
invariants critiques et la capacite a executer un pilote sans perte d argent,
de securite ou de confiance.

## Capacites recentes

- Export CSV onboarding reserve `ADMIN/OPS`, neutralise pour tableur et audite.
- Historique admin des exports onboarding via
  `GET /api/v1/admin/driver-onboarding/export-history`.
- Contrat `packages/api` pour la file onboarding, l'export et l'historique.
- UI admin "Trafic exports audite" avec rafraichissement apres export CSV.
- Documentation onboarding securite alignee sur les exports audites.
- Index docs et carte du monorepo ajoutes pour rendre l'architecture navigable.
- Metadonnees documents chauffeur enrichies avec `objectVerification` pour
  distinguer preuves declarees et confirmation provider future.
- Endpoint admin/ops de verification objet document avec audit, afin de brancher
  ensuite le provider de stockage sans changer le contrat operations.
- Verification provider locale branchee:
  `POST /api/v1/admin/driver-onboarding/:driverId/documents/:documentId/object-verification/verify-provider`
  confirme existence, taille et SHA-256 depuis le stockage configure.
- Scan/quarantaine documentaire local apres verification objet provider:
  `safetyScan.clear` pour pieces conformes, `safetyScan.quarantined` pour
  mismatch provider, extension/taille suspecte ou verification echouee.
- Garde-fous production backend renforces: demarrage refuse si Swagger reste
  active, si CORS accepte `*`, si la base pointe localhost, ou si les URLs
  documents publiques ne sont pas HTTPS/exterieures.
- Backplane PostgreSQL partage ajoute pour rate-limit et realtime:
  `RATE_LIMIT_ADAPTER=postgres` et `REALTIME_ADAPTER=postgres` sortent du
  fallback memoire et exposent `sharedBackplane=true` dans `health`.
- File durable PostgreSQL ajoutee pour les familles critiques
  `PAYMENT_WEBHOOK`, `DRIVER_DOCUMENT` et `NOTIFICATION`, avec retry borne,
  verrouillage `FOR UPDATE SKIP LOCKED`, deduplication et passage en
  dead-letter apres epuisement des tentatives.
- Producteurs critiques branches sur cette file: chaque webhook paiement
  journalise cree un job `PAYMENT_WEBHOOK`, chaque verification objet document
  chauffeur cree un job `DRIVER_DOCUMENT`, et le nouveau service notifications
  persiste la notification avant de creer un job `NOTIFICATION`.
- `/health` expose maintenant l'etat durable de la file, les familles suivies
  et les compteurs par statut pour faciliter la surveillance ops/dead-letter.
- La console admin affiche ces signaux dans System Health avec une lecture par
  famille critique, afin de voir rapidement pending/running/succeeded et
  dead-letter sans sortir du poste operations.
- Les operations peuvent maintenant lister les jobs, filtrer les dead-letters
  et remettre un job en file via endpoint admin audite avec evenement realtime.
- Durcissement navigateur ajoute: headers de securite centralises cote backend,
  CSP API, cache interdit sur auth/admin/paiements, headers admin Next.js et
  validation auth plus stricte sur email/password.
- Premiere migration admin vers session serveur: System Health utilise des
  routes Next.js locales avec cookie HttpOnly/SameSite pour consulter les
  dead-letters, accuser/masquer les incidents et remettre un job en file sans
  exposer le Bearer token backend sur cette surface navigateur.
- Barriere CSRF explicite ajoutee sur les mutations admin locales et validation
  des identifiants opaques sur les routes admin backend sensibles pour fermer
  plus tot les tentatives traversal, XSS en parametre et ID tampering.
- Validation dirty-data mobile renforcee: IDs opaques sur routes rider/driver/
  ride/trip, adresses et lieux sauvegardes sans caracteres markup/traversal,
  filenames documents chauffeur sans separateurs de chemin, storage keys
  normalisees et codes pickup strictement numeriques.
- Tests IDOR ajoutes sur lieux sauvegardes rider, annulation ride-request et
  acces/statut trip: un ID valide appartenant a un autre profil retourne un
  `NotFound` generique et ne declenche ni update ni evenement realtime.
- Premiere tranche OWASP API finance/admin ajoutee: les mutations wallet payout,
  recovery, payment verify/refund, webhook replay et exports settlement sont
  verrouillees par metadata RBAC `ADMIN`/`OPS`; les IDs sales sont rejetes par
  les tests HTTP avant appel service sur les routes finance sensibles.
- Retours checkout paiement bornes cote backend: `redirectUrl` doit correspondre
  a une origine frontend Orbi configuree avant persistance d une tentative.
- Durcissement cookie/web admin ajoute: cookie session admin `__Host-` en
  production, attributs `Secure`/`HttpOnly`/`SameSite=Strict`/priority,
  compatibilite locale preservee, headers no-store uniformes sur les proxys
  admin et headers navigateur Next.js renforces.
- Actions finance wallets chauffeurs migrees derriere routes serveur admin:
  preparation payout, marquage paye, recouvrement et exports settlement
  utilisent la session HttpOnly et le garde same-origin, sans Bearer navigateur.
- Journal webhooks paiement migre derriere routes serveur admin pour filtres,
  investigation, replay, verification fournisseur et refunds, avec IDs bornes et
  garde mutation same-origin.
- File support admin migree derriere routes serveur pour refresh et mises a jour
  statut/priorite, avec session HttpOnly et validation locale du payload.
- Rafraichissement feature flags admin migre derriere route serveur no-store afin
  de poursuivre la reduction des authentifications admin cote navigateur.
- Pipe global Nest renforce avec rejet des valeurs racine inconnues, headers
  API completes contre prefetch DNS/ouverture de telechargement, et patches pnpm
  explicites pour garder les dependances Nest type-only executables sous Jest.
- Secrets de demonstration masques dans l admin web en build production, tout
  en gardant l aide locale visible pendant les tests terrain/dev.
- Files locales de rapports d erreur mobile durcies: rider/driver relisent
  uniquement des rapports bien formes, du bon role, bornes a 20 entrees et
  redaction des tokens/emails/telephones avant replay backend.
- Auth demo Expo web stabilisee: rider/driver web repassent sur `localhost`
  quand l environnement mobile pointe vers une IP LAN, le backend accepte les
  origines localhost de dev, et Metro ignore les artefacts `.next` admin.
- Worker durable de file critique branche: les jobs `PAYMENT_WEBHOOK`,
  `DRIVER_DOCUMENT` et `NOTIFICATION` sont reclames en batch borne, completes
  apres verification d existence, ou remis en retry/dead-letter avec raison
  bornee. Les notifications sont marquees `sentAt` de maniere idempotente pour
  eviter les doubles envois logiques apres redemarrage.
- Reprise automatique des jobs `RUNNING` orphelins ajoutee: si un worker est
  interrompu apres claim, le prochain tick replace les jobs verrouilles trop
  longtemps en `PENDING` avec un `lastError` explicite, ce qui evite une panne
  silencieuse de webhooks, documents ou notifications.
- Frontiere provider notification ajoutee: le worker verifie `sentAt` avant
  dispatch, utilise un provider local idempotent par defaut et refuse les
  providers non configures. Les jobs rejoues ne declenchent donc pas de double
  envoi, et aucune donnee personnelle brute de notification n est journalisee
  dans le chemin worker/provider.
- Frontiere scanner documentaire ajoutee pour les jobs `DRIVER_DOCUMENT`: le
  worker recalcule et persiste `safetyScan` depuis `objectVerification`,
  `integrity`, type documentaire et extension, avec un provider `local-policy`
  par defaut et refus explicite des scanners externes non configures. Cette
  etape rend le scan KYC rejouable et remplacable par antivirus/anti-fraude
  reel sans exposer le document lui-meme au journal worker.
- Journal admin de file durable enrichi avec diagnostics minimises: pression de
  retry, signaux non sensibles par famille et action recommandee. Les operations
  peuvent distinguer webhook paiement, notification provider et document
  quarantainable sans lire le payload brut ni exposer de donnees utilisateur.
- Filtres ops ajoutes au journal admin de file durable: famille
  `PAYMENT_WEBHOOK`/`DRIVER_DOCUMENT`/`NOTIFICATION` et statut
  `PENDING`/`RUNNING`/`SUCCEEDED`/`DEAD_LETTER`, afin d isoler rapidement les
  incidents sans changer de surface ni exposer plus de donnees.
- Resume visuel du filtre actif ajoute au journal des jobs: volume charge,
  action ops requise, pression retry moyenne/max et signal principal minimisé,
  pour prioriser rapidement les quarantaines et webhooks sans ouvrir les
  payloads bruts.
- Requeue admin durci cote UX: les jobs non `DEAD_LETTER` ont l action
  desactivee, et les jobs requeueables exigent une confirmation contextualisee
  differente pour paiement, document KYC ou notification provider.
- Diagnostics jobs structures ajoutes: `severity`, `owner` et
  `canRequeueSafely` sont calcules cote backend et consommes par l admin web
  pour prioriser finance/trust-and-safety/ops et bloquer les requeues trop
  risqués avant correction.
- Vue owner queue ajoutee au journal admin des jobs: les jobs charges sont
  regroupes par `finance`, `trust-and-safety`, `ops` et `engineering` avec
  total, critiques, requeues bloquees et pression retry max.
- Tests admin-web ajoutes pour verrouiller les comportements critiques du
  journal jobs: resume filtre, owner queue et blocage de requeue base sur
  `canRequeueSafely`.
- Completion/failure des jobs durables durcie par verrou `lockedAt`: un worker
  ancien ne peut plus marquer comme reussi ou echoue un job deja recupere,
  remis en attente ou repris par un autre tick apres interruption.
- Horodatages admin ops durcis: System Health, journal jobs, onboarding,
  dispatch, webhooks paiement et wallets chauffeurs affichent un fallback
  operationnel quand une date provider/backend est absente ou malformee, au
  lieu de laisser remonter `Invalid Date` dans la console.
- Preuve locale paiement/refund explicitee: les fixtures Flutterwave refund
  `processing` et `completed` sont conservees dans le repo et executees par
  `pnpm test:payments:fixtures`, afin de verifier que le webhook pending ne
  deplace pas d argent et que le webhook processed finalise la reversal wallet.
- Contrat admin-web ajoute sur les routes serveur operations: chaque mutation
  locale `/api/admin/**` doit conserver le garde same-origin explicite, et les
  mutations avec identifiant dynamique doivent borner l ID avant proxy backend.
- Reglages dispatch admin migres derriere route serveur locale:
  lecture/update/reset passent par `/api/admin/dispatch-settings`, session
  HttpOnly, no-store, garde mutation same-origin et bornes locales avant proxy.
- Revue onboarding chauffeur migree derriere routes serveur locales: file,
  historique/export CSV, decisions ops, liens signes documents et verification
  provider utilisent maintenant la session HttpOnly, no-store, IDs bornes et
  garde mutation same-origin pour les actions sensibles.
- Rafraichissement Live Ops admin migre derriere route serveur locale
  `/api/admin/live-ops`, afin que le snapshot operations reste consulte via
  session HttpOnly/no-store sans authentification backend depuis le navigateur.
- Launch readiness admin migree derriere routes serveur locales: refresh et
  acknowledgement d actions utilisent maintenant session HttpOnly, no-store,
  garde mutation same-origin, owner/notes/idempotency bornes et check IDs
  valides avant proxy backend.
- Refresh System Health admin migre derriere `/api/admin/health` no-store, ce
  qui retire le dernier client API direct du board health cote navigateur.
- Stockage session mobile/web durci: les apps rider et driver conservent les
  sessions natives dans `SecureStore`, utilisent `sessionStorage` non persistant
  sur Expo web, ne retombent jamais vers `localStorage`, et tolerent les
  navigateurs qui bloquent le stockage web sans crash.
- CI GitHub renforcee avec audit de dependances `pnpm audit --audit-level
  moderate` et `git diff --check`, afin de bloquer les regressions de securite
  connues et les erreurs de whitespace avant merge.
- Ingestion `/mobile/error-reports` durcie cote backend: les payloads mixtes
  rider/driver sont rejetes avant tout audit log, ticket support ou evenement
  realtime, et le signal admin publie maintenant un `appRole` mobile normalise.
- Frontiere collector d erreurs mobiles ajoutee: le backend garde le mode local
  par defaut, peut relayer les rapports rediges vers un webhook externe borne,
  et refuse le demarrage production sans collector mobile HTTPS non local.
- Launch readiness backend enrichie: `/health.operations.productionReadiness`
  signale explicitement si le collector d erreurs mobiles externe est absent,
  local ou non HTTPS avant un pilote production.
- Gate production local ajoute: `pnpm test:production:gate` regroupe diff
  check, audit dependances, Prisma, specs readiness/backplane/collector, smokes
  admin/mobile et typecheck pour rendre les controles pre-lancement repetables.
- Ride Check chauffeur ajoute cote mobile, backend et admin live ops:
  finalisation course bloquee si le signal GPS chauffeur est absent, ancien,
  trop imprecis, physiquement impossible ou associe a une alerte route critique.
  La console operations expose maintenant l'etat `completionGate` pour triage et
  resolution manuelle auditee.
- Compte rider durci cote mobile: validation locale partagee pour contact de
  confiance et lieux favoris, rejet des textes dangereux avant mutation API,
  normalisation des coordonnees avec virgule decimale, blocage des modes de
  partage automatique sans numero Burkina et garde anti-double action sur les
  mutations compte.
- Booking rider durci: validation locale du service/paiement avant creation,
  idempotency keys centralisees, checkout non initialise pour cash,
  recalcul de preview selon le paiement choisi et reutilisation de la validation
  lieux favoris avant sauvegarde depuis le flux reservation.
- Actions driver offres/trajet durcies cote mobile: validation handler des
  offres expirees ou bloquees par course active, normalisation stricte du code
  pickup, rejet des codes incomplets avant appel API et blocage de finalisation
  directement dans l action quand Ride Check interdit la completion.
- Demandes de course backend durcies sur l invariant paiement: `paymentMethod`
  est maintenant persiste sur `RideRequest`, expose dans le contrat partage et
  pris en compte dans la deduplication de retry, afin qu un retry identique
  recupere la demande existante sans recalculer le prix verrouille tandis qu un
  changement de paiement ne se fait jamais passer pour le meme booking.

## Architecture active

| Surface | Etat |
| --- | --- |
| Backend | NestJS API modulaire, Prisma, auth/session, RBAC, audit, admin, payments, health |
| Admin web | Console operations avec onboarding, support, pricing, readiness et signaux runtime |
| Rider app | Expo app connectee aux fondations auth, booking, payment, erreurs mobiles |
| Driver app | Expo app avec onboarding, documents, disponibilite et parcours chauffeur |
| Packages | `api`, `domain`, `config`, `ui` comme contrats et primitives partages |
| Docs | Index central, architecture, runbooks, securite, onboarding, production readiness |

## Priorite d'execution

1. Capturer des fixtures provider paiement sandbox reelles en plus des fixtures
   locales deja executables: checkout, success, failed, refund pending,
   refund processed et references inconnues.
2. Brancher providers externes au worker durable: replay paiement strictement
   controle, antivirus/anti-fraude documentaire et push/SMS/email reels derriere
   les frontieres provider deja testees.
3. Adapter S3/GCS production pour objets documentaires.
4. Renforcer observabilite, alertes et dashboards capacite avant pilote large.
5. Verifier qu il ne reste pas de surface admin sensible exposee en Bearer
   navigateur; wallet/payout, refund/replay paiement, support, health, jobs,
   feature flags, dispatch, onboarding documents, live ops, launch readiness et
   system health sont deja couverts cote routes serveur locales.
6. Continuer le programme de tests securite iteratif:
   - API1/API5: IDOR/BOLA et function-level authorization sur onboarding
     documents, dispatch, support tickets et exports finance.
   - API3/API6: mass assignment, pagination abusive et filtrage excessif sur
     admin, payments, users et ride/trip dashboards.
   - MASVS/MASTG: stockage token, deep links, permissions, screenshots
     sensibles et reprise reseau sur rider/driver.
   - SSDF: SAST/SCA/secret scanning, threat modeling et preuves de regression
     avant chaque tranche pilote.

## Verification standard

Avant de considerer un changement complet:

```bash
pnpm --filter backend test -- <pattern> --runInBand
pnpm --filter backend exec prisma validate
pnpm typecheck
```

Selon la surface touchee:

```bash
pnpm --filter @orbi/api build
pnpm --filter @orbi/admin-web test:smoke
pnpm test:mobile:smoke
pnpm --filter backend test -- --runInBand
git diff --check
```

## Risques restants

- Les transports realtime/rate-limit peuvent utiliser PostgreSQL comme
  backplane partage multi-instance; il faut encore valider le comportement en
  preproduction avec `*_STRICT=true`.
- Les justificatifs chauffeur ont des politiques, liens bornes, preuve objet
  provider locale et quarantaine locale; il faut encore adapter S3/GCS
  production et brancher un scan documentaire externe.
- Les flux argent sont audites et idempotents sur les fondations, mais les
  workers webhooks/retries/dead-letter doivent etre prouves avec captures
  provider sandbox reelles en plus des fixtures locales executees par
  `pnpm test:payments:fixtures`.
- La production ne doit pas etre declaree "large" sans CI verte, observabilite,
  rollback pratique, secrets production, URLs externes HTTPS et validation
  terrain repetee.
- Les clients mobiles conservent le modele Bearer token pour Expo; l'admin web
  a migre plusieurs surfaces sensibles vers routes serveur + cookie HttpOnly,
  et les previews Expo web rider/driver evitent maintenant le stockage persistant
  du token; il faut continuer les checks MASVS sur deep links, screenshots
  sensibles, pinning et reprise reseau avant exposition publique large.
- Le backend refuse maintenant les identifiants admin et mobiles malformes
  avant Prisma; les controles IDOR metier restent assures par les requetes
  scoping existantes, et doivent continuer a etre testes par role.
