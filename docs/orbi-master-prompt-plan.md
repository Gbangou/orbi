# Orbi Master Prompt And Leader-Parity Plan

Date de reference: 13 juillet 2026 (revise et verifie par audit croise le 13
juillet 2026)

Ce document est le plan unique et partage, quel que soit l agent d ingenierie
qui l execute (Codex, Claude ou equivalent). Il ne doit pas etre duplique en
plusieurs versions concurrentes par agent: chaque session lit ce fichier,
ajoute sa tranche au journal, et le laisse plus vrai qu elle ne l a trouve.

## Role Permanent De L Agent D Ingenierie

Tu es l agent d ingenierie principal — directeur technique, produit, securite,
design et operations pour Orbi, plateforme mobilite Burkina Faso rider, driver,
admin, support et finance. Que tu sois Codex, Claude ou un autre systeme, le
mandat et les regles ci-dessous sont identiques.

Objectif absolu: transformer Orbi en plateforme plus serieuse, plus sure, plus
claire, plus locale et plus operable que Uber, Bolt et Yango sur les plans
produit, UX/UI, backend, mobile, paiements, securite, support, conformite,
observabilite et operations terrain.

## Principe Central

Ne jamais confondre feature parity et leader parity. Une fonctionnalite n est
fermee que si elle est:

1. visible et comprehensible dans le parcours utilisateur;
2. correcte dans le backend et les contrats partages;
3. auditee cote operations quand elle touche confiance, argent ou securite;
4. testee automatiquement;
5. resiliente en mode degrade;
6. mesurable avec KPI;
7. validable sur vrai device ou vrai trafic quand necessaire.

## Classification Des Gaps

- A. Code-fixable maintenant: bug ou gap d engineering ferme par code, tests,
  doc et commit.
- B. Verifiable seulement sur device/trafic reel: necessite APK, vrais devices,
  provider live, donnees terrain ou pilote.
- C. Infra/deploiement: necessite decision operateur, environnement, provider,
  secrets, monitoring externe ou scaling.
- D. Business/operations: support, assurance, supply density, contrats, pricing
  terrain, formation, police/secours, staffing.

Chaque gap doit avoir une categorie. Un gap B/C/D ne doit pas etre declare ferme
par un patch de code seul.

## Etat Global Verifie (Audit Du 13 Juillet 2026)

Audit croise effectue directement sur le code (pas seulement sur la
documentation) pour confirmer ce qui est reellement livre. Chiffres et niveaux
de maturite detailles: `../DEVELOPMENT_STATUS.md`. Resume honnete par domaine:

- **Backend/domaine**: NestJS modulaire (auth, riders, drivers, dispatch,
  trips, payments, admin, ratings, promo-codes, health) avec RBAC, audit log
  systematique sur les mutations sensibles, idempotence sur les flux argent,
  backplane PostgreSQL partage pour realtime/rate-limit, file durable avec
  dead-letter pour webhooks/documents/notifications. Integrations paiement
  reelles (Flutterwave, CinetPay) et service de detection de fraude existants
  dans le code, pas seulement planifies.
- **Onboarding chauffeur**: workflow de revue explicite avec decisions
  auditees, expiration de documents deja modelisee et exposee
  (`expiresAt`, `expiringSoonDocuments`) jusque dans l export CSV. La
  reverification periodique de type selfie live/anti-spoof n est pas
  implementee (gap A/B reel, pas seulement documentaire).
- **Mobile (rider/driver)**: i18n reel branche (`packages/i18n`, usage
  `useTranslation` dans les ecrans cles, pas un stub), dark mode reellement
  implemente (pas un simple flag), configuration EAS presente pour les deux
  apps. Aucun SDK de crash reporting externe (Sentry/Crashlytics) n est
  present dans aucun `package.json` du repo: la file locale d erreurs mobiles
  et le collector webhook existent, mais le branchement a un vrai provider
  externe reste un gap C non ferme.
- **Admin web**: audit trajets (`/admin/trips/audit`), dashboard finance,
  journal jobs, launch-readiness et system health sont branches sur des
  requetes Prisma reelles, pas des donnees simulees. Convention de tests
  "lire le fichier source, verifier des sous-chaines cles" largement utilisee
  cote admin-web — un test qui verrouille un comportement precis, mais qui ne
  remplace pas un test de rendu; a garder en tete pour ne pas sur-estimer la
  couverture reelle des regressions visuelles.
- **CI/Infra**: deux workflows GitHub Actions (`ci.yml`,
  `production-readiness-gate.yml`). Stack de deploiement actuelle: Neon
  (Postgres) + Render (API) + Vercel (admin) + Cloudflare Worker keep-alive
  (voir `deployment-runbook.md`) — un stack gratuit/terrain, pas encore une
  infra de production a grande echelle (pas d autoscaling documente, pas de
  multi-region, pas d alerting externe type PagerDuty/Better Uptime confirme
  dans le repo).
- **Documentation**: le repo dispose deja d une gouvernance documentaire mature
  (`AGENTS.md`, `DEVELOPMENT_STATUS.md`, `EXECUTION_PLAN.md`,
  `ORBI_ARCHITECTURE.md`, `SECURITY.md`, plus une douzaine de docs `docs/`
  specialisees). Le risque n est plus l absence de plan, mais la
  synchronisation: ce fichier doit rester le point d entree unique pour la
  reduction de gaps, les autres docs restant des sources de verite
  specialisees qu il reference plutot qu il ne duplique.

Conclusion honnete: Orbi n est pas un prototype. C est une fondation MVP/pilote
credible avec une discipline d ingenierie rare pour ce stade (idempotence,
audit, gates de readiness, tests systematiques). L ecart avec Uber/Bolt/Yango
n est presque plus un ecart de "code manquant" sur les fondations deja citees
ci-dessus; il est concentre dans: preuves terrain reelles (categorie B),
infra/observabilite externe de production (categorie C), et operations/business
(categorie D). Le travail de code (categorie A) qui reste est reel mais plus
cible et plus rare qu au debut du projet — ce qui veut dire que chaque session
doit chercher le gap A avec plus de rigueur, pas relacher l exigence.

## Definition De Parfait

Parfait ne veut pas dire zero defaut abstrait. Parfait signifie:

- aucun gap critique connu non classe;
- aucun flux argent ou securite sans audit;
- aucun ecran cle non verifie avec donnees reelles;
- aucun fallback qui ment a l utilisateur ou aux operations;
- aucune promesse produit non mesurable;
- aucune activation chauffeur sans preuve complete et decision explicite;
- aucun paiement ou remboursement sans idempotence et reconciliation;
- aucun changement sensible sans tests et runbook aligne.

## Barres De Qualite

### Rider

- comprendre en moins de 5 secondes: prix, delai, securite, paiement,
  chauffeur et action suivante;
- prix upfront explicable, avec raisons et limites;
- SOS, partage, pickup code et support visibles sans panique visuelle;
- etats loading, erreur, vide, offline et paiement echoue concus comme des
  etats normaux du produit.

### Driver

- comprendre en moins de 5 secondes: statut, gains, offre, effort, risque et
  action suivante;
- onboarding decisionnable, revocable et expire;
- offres claires: payout, pickup effort, trip effort, temps restant,
  acceptation/refus sans ambiguite;
- fatigue, disponibilite, suspension et incidents visibles sans bruit.

### Admin/Ops

- comprendre en moins de 10 secondes: incidents, paiements, supply, support,
  health, launch blockers;
- chaque action critique doit avoir owner, audit, SLA et prochain geste;
- aucune metrique simulee ne doit ressembler a une metrique live.

### Backend/Securite

- roles stricts rider/driver/admin;
- BOLA/IDOR defendu sur trips, documents, paiements, support et admin;
- donnees sensibles masquees ou justifiees;
- webhooks verifies, idempotents et reconciliables;
- route monitoring, SOS, partage et support relies dans la meme histoire ops;
- stockage token, liens signes, captures d ecran et erreurs mobiles durcis.

### UX/UI

- aucun ecran ne doit sembler prototype;
- pas d emoji decoratif dans les flux serieux;
- pas de bouton coupe, texte debordant, scroll inutile ou hierarchie confuse;
- petits Android, dark mode, accessibilite et donnees reelles sont des cibles
  de qualite, pas des options.

## Workflow De Chaque Session

1. Lire le code et les docs pertinentes.
2. Identifier le gap le plus haut impact.
3. Le classer A/B/C/D.
4. Appliquer une tranche courte et coherente.
5. Ajouter ou renforcer les tests.
6. Lancer tests cibles et `pnpm typecheck` quand applicable.
7. Mettre a jour la doc si le comportement ou la promesse change.
8. Commit puis push.
9. Laisser hors commit les fichiers locaux sans rapport.

## Plan De Reduction Des Gaps

### Phase 0: Confiance Et Verite Produit

Objectif: eliminer les bugs ou mensonges qui cassent la confiance.

- A: verifier tous les partages de telephone/adresse et renforcer le masquage
  conditionnel.
- A: rendre impossible toute metrique admin simulee presentee comme live.
- A: durcir les tickets support critiques avec SLA, owner et escalation.
- A: fermer les surfaces mobiles sensibles non couvertes par tests privacy.
- B: valider login, booking, paiement, course active et support sur vrai APK.

### Phase 1: Safety Superieure Aux Leaders

Objectif: depasser la simple presence de SOS/share/pickup code.

- A: plusieurs trusted contacts ou au minimum modele extensible et audit.
- A: partage automatique selon mode nuit/zone/tous trajets.
- A: route monitoring enrichi: pickup suspect, arret communication,
  progression impossible et alerte ops dedupee.
- A/B: selfie live chauffeur avant mise en ligne et reverification periodique.
- B/D: doctrine support incident, appel secours local, procedure escalade.

### Phase 2: Paiements Et Argent Production-Grade

Objectif: zero double debit, zero transition argent opaque.

- A: etendre les tests d idempotence a tous les endpoints argent.
- A: dashboards finance: refund pending, wallet recovery, payout backlog,
  webhook ignored, reconciliation age.
- C: provider live configure, secrets, verification webhook stricte.
- B: tests terrain mobile money sur reseau reel et faibles connexions.

### Phase 3: Marketplace Et Dispatch

Objectif: ETA, supply et matching fiables localement.

- A: rendre les signaux supply/ETA explicitement estimes vs live.
- A: ajouter fairness engine initial rider accessibilite / payout chauffeur /
  marge ops.
- B/D: calibrer par Ouaga, Bobo, heure, pluie, chaleur, quartier et type
  vehicule.
- C: load test dispatch, realtime et rate-limit multi-instance.

### Phase 4: UX/UI Native Premium

Objectif: chaque ecran doit inspirer confiance avant meme que l utilisateur
comprenne l architecture.

- A: audit ecran-par-ecran rider et driver avec donnees seedees.
- A: corriger scroll excessif, textes longs, boutons coupes, hierarchy noise.
- A/B: verifier dark mode, petits Android, permissions, offline et retry.
- B: capture video/screenshot sur devices reels et checklist de release.

### Phase 5: Observabilite Et Production

Objectif: savoir avant les utilisateurs quand quelque chose casse.

- A/C: Sentry ou Crashlytics, tracing distribue, alertes externes.
- A: dashboards long terme pour crash-free sessions, conversion booking,
  acceptance rate, first response support, payment success.
- C: capacity planning, backup/restore, chaos DB/backplane, canary.

### Phase 6: Operations Et Business

Objectif: rendre le produit exploitable comme un service de transport reel.

- D: staffing support, formation, scripts incident, horaires, SLA.
- D: assurance, CGU, politique confidentialite, retention donnees.
- D: acquisition et verification chauffeurs, densite par zone.
- D: pilote terrain et boucle hebdomadaire produit/pricing/safety.

## Backlog Initial Priorise

1. SLA support critique et escalation ops visibles dans admin. Categorie A.
2. Trusted contacts avances et partage automatique. Categories A/B.
3. Reverification chauffeur: expirations, selfie live, suspension. Categories
   A/B/D.
4. Admin finance dashboard reconciliation age et payout risk. Categorie A.
5. Audit UX avec donnees reelles pour tous les etats secondaires. Categories
   A/B.
6. Observabilite externe mobile/backend. Categories A/C.
7. Calibration pricing/ETA par donnees pilote. Categories B/D.

## Journal D Execution

- 13 juillet 2026: debut Phase 0, gap A "SLA support critique". La file
  support admin expose maintenant un SLA derive par ticket: tier, target,
  `dueAt`, premiere reponse, owner support/ops, retard et etat
  `on_track`/`due_soon`/`breached`/`responded`/`closed`. Ce travail ne ferme
  pas le staffing support ni la preuve de temps de reponse terrain, qui restent
  des gaps B/D.
- 13 juillet 2026: debut Phase 1, gap A "trusted contact durable". Le mode de
  partage du contact de confiance n est plus seulement renvoye apres update:
  il est persiste sur le profil rider via `trusted_contact_share_mode`, afin que
  les modes `NIGHT` et `ALL_TRIPS` restent vrais apres rechargement.
- 13 juillet 2026: Phase 1, gap A "auto-share trusted contact". Quand un
  chauffeur accepte une course, le backend prepare maintenant automatiquement un
  lien de partage audite si le rider a configure `ALL_TRIPS` ou `NIGHT` pendant
  la plage nocturne. La livraison externe SMS/WhatsApp/provider reste un gap
  B/C distinct et ne doit pas etre declaree fermee.
- 13 juillet 2026: Phase 1, gap A "modele trusted contacts extensible". Le
  backend ajoute `rider_trusted_contacts`, backfill les contacts existants,
  synchronise le contact principal depuis l endpoint actuel, expose
  `trustedContacts[]` dans le contrat API et utilise le premier contact actif
  prioritaire pour l auto-share. L UI multi-contacts et la livraison provider
  restent des gaps A/B/C separes.
- 13 juillet 2026: Phase 1, gap A "pickup suspect route monitoring". Le backend
  ajoute l alerte `PICKUP_MISMATCH`: apres une periode de grace, une course
  encore `MATCHED` avec un chauffeur trop loin du point de depart cree un ticket
  support, un audit log et un event realtime dedupe. La calibration terrain des
  seuils reste un gap B/D.
- 13 juillet 2026: Phase 1, gap A "signal chauffeur ancien Live Ops". Live Ops
  expose maintenant `signalState` par trajet, compte `staleDriverSignals` et
  affiche le compteur dans la console admin. Le seuil est aligne sur le garde-
  fou de finalisation; les procedures d appel support restent un gap D.
- 13 juillet 2026: Phase 1, gap A "UI trusted contacts rider". L app rider
  affiche maintenant `trustedContacts[]`, compte les contacts actifs, masque les
  numeros et garde l edition du contact principal. L API de creation/ordre de
  plusieurs contacts reste un gap A separe.
- 13 juillet 2026: Phase 1, gap A "API trusted contacts complete". Le backend
  expose creation, mise a jour, priorite et desactivation douce de jusqu a trois
  contacts actifs, resynchronise le contact principal, audite chaque mutation et
  publie le contrat API client. La livraison SMS/WhatsApp reste un gap B/C.
- 13 juillet 2026: Phase 1, gap A "UI gestion trusted contacts complete". L app
  rider permet maintenant d ajouter un contact, choisir sa priorite, promouvoir
  un contact en principal et retirer un contact actif avec numeros masques et
  tests smoke. La livraison provider reste separee.
- 13 juillet 2026: debut Phase 2, gap A "dashboard finance argent". Le backend
  expose `GET /admin/finance-dashboard`, le contrat API partage publie
  `AdminFinanceDashboardResponse` et la console admin affiche refund pending,
  wallet recovery, payout backlog, webhook ignored et reconciliation age avec
  owner, severite et prochain geste. Les tests provider live, secrets et mobile
  money terrain restent des gaps B/C.
- 13 juillet 2026: Phase 2, gap A "idempotence wallet top-up". Le rechargement
  wallet rider accepte maintenant `Idempotency-Key`, derive un `depositId`
  stable, reutilise le top-up existant sur retry reseau, rejette la reutilisation
  avec payload different et expose l option dans le client API. Les tests
  provider live PawaPay et reseau mobile money restent des gaps B/C.
- 13 juillet 2026: Phase 2, gap A "webhook PawaPay wallet". Les callbacks
  PawaPay dont le `depositId` correspond a un wallet top-up sont maintenant
  traites avant la reconciliation des paiements course: credit wallet idempotent,
  ledger unique, replay final explicite et journal admin `persisted_wallet_*`.
  La preuve provider live sur reseau reel reste un gap B/C.
- 13 juillet 2026: Phase 2, gap A "idempotence refund admin". Les remboursements
  admin acceptent maintenant `idempotencyKey`, stockent un hash d intention dans
  les metadata refund, rejettent une reutilisation de cle avec payload different
  et distinguent les replays dans l audit ops. La confirmation provider live
  reste un gap B/C.
- 13 juillet 2026: Phase 2, gap A "settlement payouts rapprochable". Les exports
  CSV/PDF de settlement chauffeur incluent maintenant un `settlementBatchId`
  stable derive du statut, des payouts et du total, egalement journalise dans
  l audit. La validation bancaire/mobile money terrain reste un gap B/D.
- 13 juillet 2026: Phase 2, gap A "gate production argent". Launch readiness
  expose maintenant `payment-production-gate`, qui synthese refunds pending,
  webhooks ignores, wallet recovery et payout backlog avant trafic argent reel.
  Ce gate cloture la partie code Phase 2; provider live, secrets production et
  tests reseau reel restent B/C et seront geres hors code.
- 13 juillet 2026: debut Phase 3, gap A "ETA/supply estimes vs live". Les
  options de trajet exposent maintenant `etaSource`, `supplySource`,
  `signalFreshnessSeconds`, `signalLabel` et `reliabilityNote`; le backend
  distingue live recent, estime et degrade, et les apps rider home/booking
  affichent cette verite au lieu de presenter les ETA comme des certitudes.
  La calibration terrain par ville, meteo, quartier et trafic reste B/D.
- 13 juillet 2026: Phase 3, gap A "fairness engine initial". Le dispatch calcule
  maintenant un `fairnessScore` par offre, avec label, breakdown rider /
  chauffeur / ops et resume visible cote chauffeur; ce signal sert aussi de
  tie-breaker et est journalise dans l audit de reservation. La calibration
  economique par donnees pilote reste B/D.
- 13 juillet 2026: debut Phase 4, gap A "petits ecrans signaux marketplace".
  Les lignes longues de details d offre chauffeur sont maintenant bornees et le
  selecteur de vehicule rider gagne de l espace stable pour ETA, source du
  signal et chauffeurs proches. L audit visuel device reel reste B.
- 13 juillet 2026: Phase 4, gap A "premiers moments chauffeur compacts".
  L auth et l onboarding chauffeur bornent maintenant les slogans, hints,
  benefices, documents et recapitulatif pour petits Android; le CTA final est
  plus court et un garde-fou statique empeche de perdre ces bornes. La capture
  visuelle sur device reel reste B.
- 13 juillet 2026: Phase 4, gap A "premiers moments rider compacts". L auth
  passager borne maintenant slogan, trust line, footer legal et bouton demo; le
  CTA booking garde un label compact et un guard statique protege auth/booking
  contre les regressions petits ecrans. La capture visuelle device reel reste B.
- 13 juillet 2026: debut Phase 5, gap A "posture observabilite mobile". Les KPIs
  operationnels exposent maintenant erreurs mobiles critiques, sessions touchees,
  posture `good`/`warn`/`bad` et action ops recommandee; l admin affiche ce
  signal avec le crash-free rate. Le branchement Sentry/Crashlytics externe
  reste un gap C.
- 13 juillet 2026: Phase 5, gap A "gate readiness crash mobile". Launch
  readiness expose maintenant `mobile-observability-gate`: les crashs mobiles
  critiques recents limitent ou bloquent le pilote selon recurrence, generent
  une action engineering et empechent de traiter l observabilite comme un simple
  indicateur dashboard. Les alertes externes Sentry/Crashlytics restent un gap C.
- 13 juillet 2026: Phase 5, gap A "triage crash mobile actionnable". Les KPIs
  et le gate readiness exposent maintenant le signal critique dominant
  surface/code/owner/count, afin que l equipe sache quelle surface mobile
  corriger en premier sans ouvrir les payloads bruts. Les tendances long terme
  et alertes externes restent un gap C.
- 13 juillet 2026: Phase 5, gap A "livraison collector auditable". Le collector
  mobile retourne maintenant un resultat structure local/webhook, succes,
  HTTP degrade ou exception; le backend ecrit un audit `LOCAL_ONLY`,
  `DELIVERED` ou `DEGRADED` pour que les ops voient aussi les pannes de
  livraison observabilite. Le routage d alerte externe reste un gap C.
- 13 juillet 2026: Phase 5, gap A "readiness collector degrade". Les KPIs admin
  comptent maintenant les livraisons collector degradees sur 7 jours et le gate
  `mobile-observability-gate` passe en warning si la collecte externe echoue,
  meme sans crash mobile critique recurrent. Les alertes hors plateforme restent
  un gap C.
- 13 juillet 2026: Phase 5, gap A "resilience production explicite". Le backend
  refuse maintenant une production sans preuve ISO de restore DB
  `OPERATIONS_BACKUP_RESTORE_DRILL_AT` ni enveloppe
  `OPERATIONS_PILOT_MAX_CONCURRENT_TRIPS`; `productionReadiness` expose les
  checks `database-backup-restore-drill` et `pilot-capacity-envelope`. La preuve
  cloud/provider reelle et les drills chaos restent des gaps C/D.
- 13 juillet 2026: Phase 5, gap A "resilience visible ops". La console health
  extrait maintenant ces checks dans une carte `resilience pilote`, pour que les
  ops voient immediatement restore DB et capacite pilote sans parcourir tous les
  checks runtime. Les exercices chaos/canary reels restent des gaps C/D.
- 13 juillet 2026: Phase 5, gap A "canary chaos gates". Le backend exige aussi
  `OPERATIONS_CANARY_RELEASE_DRILL_AT` et `OPERATIONS_CHAOS_DRAIN_DRILL_AT` en
  production, expose `canary-release-drill` et `chaos-drain-drill` dans
  `productionReadiness`, et la carte admin resilience les rend visibles avec
  restore DB et capacite. Les preuves terrain/cloud restent a produire hors code.
- 13 juillet 2026: debut Phase 6, gap A "permanence support". La file support
  expose maintenant une posture `ready`/`strained`/`blocked`, une action ops,
  les tickets actifs/urgents/SLA en retard et la charge par owner support/ops;
  l admin affiche ce signal avant la liste des tickets. Le staffing humain reel
  et les horaires d astreinte restent des gaps D.
- 13 juillet 2026: Phase 6, gap A "conformite pilote explicite". Le backend
  exige en production `OPERATIONS_TERMS_VERSION`,
  `OPERATIONS_PRIVACY_VERSION` et `OPERATIONS_INSURANCE_POLICY_REF`, expose les
  checks `legal-terms-version`, `privacy-policy-version` et
  `insurance-policy-reference`, et la console health les affiche dans une carte
  conformite pilote. La revue juridique et les contrats signes restent des gaps D.
- 13 juillet 2026: Phase 6, gap A "couverture supply pilote". Launch readiness
  expose maintenant `driver-supply-coverage`: les demandes `REQUESTED` sont
  comparees aux chauffeurs approuves non suspendus, avec warning sous 2x et
  blocage si une demande ouverte existe sans chauffeur exploitable. La densite
  terrain par zone, les horaires reels et l acquisition chauffeurs restent D.
- 13 juillet 2026: Phase 6, gap A "cadence revue pilote". Le backend exige en
  production `OPERATIONS_PILOT_REVIEW_AT`, expose `pilot-review-cadence` dans
  `productionReadiness` et la carte admin resilience pilote, afin qu aucune
  extension ne parte sans revue recente produit/pricing/safety. Les comptes
  rendus terrain et decisions business restent D.
- 13 juillet 2026: Phase 6, gap A "renouvellement documents chauffeur". Les
  dossiers onboarding comptent maintenant les pieces approuvees qui expirent
  sous 30 jours (`expiringSoon`), les affichent dans l admin, les exportent en
  CSV et bloquent l approbation chauffeur tant que la piece requise n est pas
  renouvelee. Les relances automatiques, selfie match et suspension periodique
  restent des gaps A/B/D distincts.
- 13 juillet 2026: Phase 6, gap A "gate documents chauffeur expires".
  Launch readiness expose maintenant `driver-document-renewals`: les pieces
  chauffeur approuvees mais expirees bloquent le lancement, et celles qui
  expirent sous 30 jours limitent le pilote avec action ops. La suspension
  automatique apres expiration terrain reste un gap A/D distinct.
- 13 juillet 2026: Phase 6, gap A "blocage mise en ligne document expire".
  L API chauffeur refuse maintenant `ONLINE` quand un document approuve du
  chauffeur est expire, journalise
  `DRIVER_DOCUMENT_RENEWAL_AVAILABILITY_BLOCKED` et force le renouvellement
  avant reprise des offres. Les relances automatiques restent un gap A separe.
- 13 juillet 2026: audit croise complet du repo (code + toute la
  documentation existante) avant de generaliser ce document a tout agent
  d ingenierie. Gap A confirme et ferme dans la foulee: "export CSV trajets
  qui ment silencieusement". Le board `trips-audit-board.tsx` collectait deja
  `fromDate`/`toDate`/`search` pour l export, et le backend
  (`TripsExportQueryDto`, `admin.service.ts#tripsExportCsv`) les supportait
  deja completement, mais la route serveur admin-web
  `app/api/admin/trips/export.csv/route.ts` ne lisait et ne transmettait que
  `status`/`limit` — un ops filtrant par date ou par nom recevait un export
  non filtre sans aucun signal d erreur. Corrige: la route lit et borne
  desormais les trois filtres avant de proxyer au backend, le contrat
  `packages/api` declare le type complet, et un test de regression verrouille
  les trois filtres transmis. Verifie par `pnpm --filter @orbi/api build`,
  la suite complete `@orbi/admin-web` (16 suites, 103 tests) et
  `pnpm typecheck` sur tout le workspace.
- 13 juillet 2026: gap A ferme "surface crash mobile toujours unknown". Le
  crash de rendu (ErrorBoundary) rider et driver capturait deja le pathname
  courant en contexte mais classifiait chaque crash avec `surface: 'unknown'`
  en dur, quel que soit l ecran casse — impossible pour le support de savoir
  quoi corriger. Ajoute `resolveMobileRenderCrashSurface` (partage dans
  `@orbi/api`) pour deriver la surface depuis le pathname, branche cote rider
  et driver, avec tests de regression. Decouvert en direct: un vrai ticket
  production ("Erreur mobile MOB-GENERIC-API cy9x0g", 13 juillet 2026 17:59)
  cree par le compte rider reel de l operateur avait exactement ce symptome.
- 13 juillet 2026: incident ouvert, gap B "crash reel bloquant la connexion
  rider". L operateur a un APK rider installe qui plante (ecran ErrorBoundary)
  de maniere reproductible sur son compte reel, reseau actif. Diagnostic
  tente sans nouvel APK (refuse explicitement) ni acces `adb logcat`
  (telephone non connecte en USB): code de `auth.tsx`, `OrbiButton`,
  `ErrorBoundary` et `home.tsx` relus sans defaut evident trouve a ce stade.
- 14 juillet 2026: incident ferme, gap A "coordonnees lieu enregistre en
  chaine avec virgule decimale". Repro precise obtenue de l operateur: le
  crash survient sur l ecran de reservation, au niveau du champ destination
  "Ou allez-vous". Cause reelle trouvee et corrigee (`book.tsx`,
  `place-search.tsx`): un lieu enregistre reel avait des coordonnees renvoyees
  en chaine avec virgule decimale (ex `"12,3412"`); `toPlaceFromSavedPlace`
  les assignait telles quelles a un champ type `number`, et
  `destinationSuggestions` appelait `.toFixed(4)` dessus des le premier rendu
  de l ecran — plantage synchrone garanti pour ce compte, invisible avec un
  compte demo/neuf. `toFiniteCoordinate` coerce desormais number/chaine
  (virgule ou point) avant tout usage, avec test de regression reproduisant
  exactement `latitude: '12,3412'`. Ce correctif a ete commit et pousse
  directement (`27cfe90`), avant que le diagnostic base sur les logs internes
  n aboutisse — la piste utile a ete la reproduction precise fournie par
  l operateur, pas l analyse de code seule.
- 14 juillet 2026: gap A "cartes WebView qui plantent tout l ecran". Independant
  du gap ci-dessus mais decouvert dans la meme investigation: les 6 cartes
  natives (rider: home-map-view, trip-map-view, saved-places-map; driver:
  driver-home-map-view, trip-map-view, approach-map-view) sont des WebView
  react-native-webview dont un echec de rendu natif remontait a l ErrorBoundary
  applicatif entier au lieu de degrader localement. Chaque carte enveloppe
  desormais son WebView natif dans un ErrorBoundary local (nouveau prop
  `fallback` sur `@orbi/ui`'s `ErrorBoundary`) qui retombe sur le panneau deja
  concu pour `Platform.OS==='web'`, avec tests de regression cote rider et
  driver. Necessite un nouvel APK pour s appliquer; l operateur a explicitement
  demande d attendre son feu vert avant tout rebuild.
- 14 juillet 2026: gap A ferme "audit trajets sans filtre statut/date". Seul
  l export CSV trajets supportait `status`/`fromDate`/`toDate`; la vue d audit
  elle-meme (risques, argent a verifier, owner queue) n acceptait que
  `lookbackHours`, empechant les ops de fermer une journee precise ou de
  cibler un statut sans passer par l export. `TripsAuditQueryDto`,
  `admin.service.ts#tripsAudit`, le contrat `packages/api` et le board
  admin-web acceptent desormais les trois filtres, avec une plage de dates
  explicite qui prend le pas sur `lookbackHours` et les filtres appliques
  reflechis dans `window`. Tests de regression backend et admin-web ajoutes;
  `pnpm typecheck` et les suites admin-web/backend concernees verifies au vert.
  Rapprochement wallet/payout et resolution auditee des anomalies (le reste de
  la priorite DEVELOPMENT_STATUS.md) restent un gap A distinct, pas encore
  ferme.
- 14 juillet 2026: gap A ferme "audit trajets sans resolution operable". La
  vue audit classait les risques finance/ops/support mais ne permettait pas a
  l equipe de cloturer un dossier avec justification, ce qui laissait un ecart
  majeur avec une exploitation leader-level: files lisibles mais pas de
  workflow de decision auditable. Ajout d une resolution backend
  `TRIP_AUDIT_RISK_RESOLVED` liee au trajet, a l utilisateur ops/admin et a
  l empreinte exacte des raisons de risque; un ancien resolu ne masque donc
  pas un nouveau risque different sur le meme trajet. Le contrat `packages/api`,
  la route proxy admin-web no-store/CSRF-safe et le board `trips-audit-board`
  exposent desormais une justification par risque et la cloture auditee. Les
  risques resolus sortent des files actives et `resolvedRiskTripCount` donne
  la preuve de traitement. Les rapprochements provider live et la preuve terrain
  restent des gaps B/C; les decisions support/process hors outil restent D.
- 14 juillet 2026: incident production resolu, gap A "crash instantane sur
  Ou allez-vous". L operateur a fourni une reproduction precise (ecran
  reservation, champ destination) permettant de confirmer la cause exacte:
  un lieu enregistre reel avait des coordonnees renvoyees en chaine avec
  virgule decimale; `destinationSuggestions` appelait `.toFixed(4)` dessus des
  le premier rendu de l ecran, plantage synchrone garanti pour ce compte,
  invisible avec un compte demo. Corrige (`toFiniteCoordinate` coerce
  number/chaine, virgule ou point) avec test de regression exact. Audit
  complementaire effectue sur tout le reste de l app rider (ratings, distances,
  fares affiches via `.toFixed`) sans trouver d autre occurrence non convertie
  cote backend. APK rider regenere en profil `field-test` apres verification
  complete (tests + typecheck) suite a autorisation explicite de l operateur.
- 14 juillet 2026: gap A ferme "offres chauffeur fragiles aux nombres sales".
  Le crash rider lie aux coordonnees texte a revele une classe de risque plus
  large: plusieurs surfaces driver formataient les distances/gains d offre via
  `.toFixed`, `Math.round` ou `formatXof` en supposant des nombres JS purs.
  Si un backend, cache ou proxy renvoyait `distanceKm`, `pickupDistanceKm`,
  `driverPayout`, `etaToPickupMinutes` ou scores sous forme de chaine
  (`"5,8"`, `"1476"`) ou valeur non finie, le cockpit chauffeur pouvait
  planter ou afficher une information incoherente. Ajout de helpers
  `toFiniteOfferNumber`, `formatDriverOfferDistance` et
  `formatDriverOfferMinutes`, reutilises par l accueil chauffeur et les cartes
  d offres; les valeurs texte avec virgule sont normalisees, les valeurs sales
  degradent en libelle indisponible. Tests helpers et smoke driver couvrent
  une offre complete avec champs numeriques stringifies.
- 14 juillet 2026: gap A ferme "suivi live rider/driver fragile aux nombres
  stringifies". Les helpers de mission active rider et driver supposaient que
  `routeMonitoring.latestPosition` exposait toujours des nombres JS purs pour
  distances, precision, vitesse et coordonnees. En cas de replay API, cache ou
  provider renvoyant `"0,4"`, `"12,37"` ou une valeur non finie, les labels
  `.toFixed()` pouvaient planter le suivi live ou masquer l etat reel. Les
  flux `rider-active-flow`, `driver-active-flow`, `rider-position-signal` et
  `driver-presence-signal` normalisent desormais number/string avec virgule,
  puis degradent en libelles indisponibles quand la valeur est sale. Tests
  actifs et position/presence ajoutent des payloads stringifies.
- 14 juillet 2026: gap A ferme "ratings et metriques profil fragiles". Les
  surfaces rider activite/recu et driver profil utilisaient encore certains
  `.toFixed`, `Math.round` ou ratios directement sur les ratings/distances
  d affichage. Ajout d un helper rider `rider-display-format` pour ratings,
  distances et ETA, raccorde a `activity.tsx` et `receipt.tsx`; extension des
  helpers `driver-profile-signal` pour accepter nombres stringifies et ratios
  d acceptation (`"0,82"` -> `82%`). Les valeurs sales degradent en fallback
  au lieu de faire tomber l ecran.
- 14 juillet 2026: gap A ferme "montants et ratios chauffeur disperses". Les
  surfaces accueil/revenus chauffeur avaient encore des `toLocaleString` et
  `Math.round` directs sur gains, bonus, payout ou taux d acceptation. Les
  helpers `driver-earnings-signal` normalisent desormais number/string avec
  virgule, formatent les montants via `formatXof`, calculent les ratios de
  facon bornee, et le graphe revenus ignore proprement les payouts sales.
  Tests helpers et smoke driver complet valident les parcours visibles.
- 14 juillet 2026: gap A ferme "argent rider fragile aux payloads imparfaits".
  Les surfaces wallet, accueil, booking, selecteur vehicule, activite,
  historique, recu, rating et resume de trajet actif exposaient encore des
  montants ou remises calcules directement depuis les payloads API. Ajout d une
  couche `rider-display-format` pour normaliser les montants number/string
  (`"2500"`, `"2500,5"`), borner les remises promo, calculer les tarifs
  remises et degrader en libelle indisponible au lieu de provoquer un crash.
  Les ecrans rider critiques utilisent desormais ce helper unique. Tests helper,
  smoke rider complet et typecheck workspace valident cette tranche.
- 14 juillet 2026: gap A ferme "tarifs driver actifs hors helper". Les surfaces
  driver de mission active, carte d offre, modal d accueil et flash de cloture
  avaient encore quelques labels argent formates directement via `formatXof` ou
  `toLocaleString`, avec risque de degradation incoherente si un montant arrive
  en chaine. Le formatter d offre est desormais exporte et reutilise, la mission
  active passe par `driver-earnings-signal`, et la cloture de trajet normalise
  `actualFare` avant de calculer le net. Tests offer-signal et driver-active-flow
  couvrent les montants stringifies.
- 15 juillet 2026: gap A ferme "Ride Check chauffeur partiellement aveugle aux
  nombres stringifies". Les signaux operationnels driver acceptaient les `NaN`
  mais traitaient encore `accuracyMeters`, `speedKph`, `alertCount` et fatigue
  comme invalides ou non critiques quand ils arrivaient en chaine avec virgule.
  `driver-operational-signal` normalise desormais number/string avant les
  comparaisons de risque, les labels precision/vitesse/alertes et le message
  fatigue. Tests dedies valident les payloads stringifies et sales.
- 15 juillet 2026: gap A ferme "dates rider fragiles". Le recu, l activite,
  l historique et la timeline realtime formataient encore certaines dates via
  `new Date(...).toLocale...` directement dans les composants. Une date API
  invalide pouvait donc faire fuiter `Invalid Date` ou degrader l ecran selon
  la plateforme. `rider-display-format` centralise maintenant date longue, date
  courte, date historique, heure timeline et duree de trajet avec fallback. Les
  ecrans rider critiques et `realtime-widgets` utilisent ces helpers.

```text
Tu es l agent d ingenierie Orbi (Codex, Claude ou equivalent). Ta mission est
de reduire les gaps avec Uber, Bolt et Yango sans tomber dans la copie
superficielle.

A chaque tour:
- lis le code avant d agir;
- choisis le gap le plus impactant;
- classe-le A/B/C/D;
- implemente seulement ce qui peut vraiment etre ferme;
- ajoute tests et docs;
- lance les validations;
- commit et push;
- ne declare jamais ferme un gap qui exige device, trafic, infra ou operations.

La priorite absolue est la confiance: securite, argent, support, disponibilite,
clarte UX et verite des metriques. La qualite visible doit etre aussi serieuse
que la logique backend. Le produit doit etre local Burkina Faso, operable par
une petite equipe, et plus clair que les leaders mondiaux.
```
