# Audit complet du monorepo Orbi

Date d'audit: 2026-08-10  
Portee: inspection statique de `apps/*`, `packages/*`, Prisma, migrations, routes backend, services, stores/hooks/ecrans frontend, temps reel, paiements, portefeuille, webhooks, administration, feature flags, logs, tests, CI/CD, Docker, environnements et documentation.  
Contrainte respectee: aucun fichier applicatif n'a ete modifie.

## Verdict court

Orbi est coherent et tres avance pour un environnement local et des tests internes encadres. Le backend a une vraie structure metier, Prisma est valide, les apps mobiles et l'admin ont des smoke tests, et les builds passent.

Le produit n'est pas pret pour une beta serieuse, un pilote terrain ou la production. Les principaux bloqueurs sont l'authentification du WebSocket temps reel, le deploiement Render qui seed des comptes de demonstration, l'absence d'upload documentaire reel, les OTP/SMS qui peuvent reussir sans livraison, les paiements encore sans captures sandbox fournisseur, et le gate production bloque par des vulnerabilites SCA.

Recommandation honnete: pret pour tests internes; non pret pour beta controlee, pilote limite ou production.

## Architecture observee

- `apps/backend`: API NestJS, Prisma, modules auth, riders, drivers, ride requests, trips, payments, scheduled rides, admin, health, voice, notifications, realtime, rate limit.
- `apps/admin-web`: console Next.js d'exploitation, authentification admin serveur, boards live ops, onboarding chauffeurs, pricing, support, finance, sante systeme, feature flags.
- `apps/rider-app`: Expo / React Native avec auth, reservation, activite, compte, portefeuille, recus, suivi de course, favoris, recherche de lieux.
- `apps/driver-app`: Expo / React Native avec auth, accueil, offres, disponibilite, revenus, profil, onboarding, incentives.
- `packages/api`: client HTTP partage et routes API typees.
- `packages/config`: resolution runtime des URL API, flags et etats de lancement.
- `packages/domain`: enums, tarification Burkina Faso, types et regles partagees.
- `packages/ui`: composants et hooks partages, dont carte, statut reseau et realtime WebSocket.
- Base de donnees: PostgreSQL via Prisma.
- Deploiement: Docker Compose staging, Render, workflows GitHub Actions.

## Resultats de baseline

- `pnpm --filter backend exec prisma validate`: OK.
- `pnpm typecheck`: OK.
- `pnpm --filter backend test -- --runInBand`: OK, 94 suites / 1249 tests.
- `pnpm test:admin:smoke`: OK, 16 suites / 129 tests.
- `pnpm test:mobile:smoke`: OK, rider 19 suites / 152 tests, driver 22 suites / 142 tests.
- `pnpm build`: OK.
- `pnpm test`: KO localement avec `spawn EPERM` sur les workers Jest; le backend passe en `--runInBand`.
- `pnpm test:production:gate`: KO. Hors sandbox, le gate passe `git diff --check` et hygiene secrets, puis echoue sur `pnpm audit` avec 16 vulnerabilites, dont 9 `high`.
- Lint: les lints non-mutants des frontends/packages passent; le lint backend non-mutant echoue avec environ 1009 problemes, principalement Prettier, plus plusieurs regles TypeScript.

## Ce qui fonctionne reellement

- Prisma schema valide, migrations presentes et modele domaine riche: utilisateurs, sessions, OTP, riders, chauffeurs, documents, demandes, courses, paiements, webhooks, portefeuille, payouts, tickets, audit logs, settings, jobs, promos et courses planifiees.
- Auth backend avec sessions, roles, guards, OTP, profils rider/driver et restrictions admin.
- Admin web avec session serveur httpOnly, verification du role admin/ops/support via backend et proxy SSE authentifie.
- Paiements backend structurants: tentatives idempotentes, ledger wallet, webhooks, replay, remboursements manuels, verification de signatures en production pour PawaPay.
- Tarification et domaine Burkina Faso centralises dans `packages/domain`.
- Tests backend et smoke tests frontend substantiels.
- Validation de configuration production stricte dans le backend: bloque Swagger en production, secrets dev, origins localhost/wildcard, DB localhost, realtime/rate-limit non Postgres, PawaPay incomplet, URLs documentaires non HTTPS.

## Ce qui est incomplet ou simule

- Temps reel WebSocket: le client transmet un token dans l'URL, mais le gateway backend ne l'authentifie pas et accepte des abonnements declares par le client.
- Documents chauffeurs: generation de liens et validation de metadonnees existent, mais pas d'upload binaire ni de stockage objet productionnel.
- SMS/OTP: sans fournisseur SMS configure, le code OTP est loggue; en cas d'erreur de livraison, l'API peut continuer a repondre succes.
- Paiements: integration PawaPay reelle cote code, mais preuves fournisseur seulement `local_policy` / `schema_compliant`, aucune capture sandbox.
- CinetPay: remboursement explicitement non implemente.
- Notifications: push Expo present; SMS, email et in-app restent en fournisseur local.
- Voice: reconnaissance par heuristiques et landmarks codes en dur; pas de moteur STT/geocoding robuste.
- Protection capture ecran: fonctions appelees sur ecrans sensibles mais actuellement no-op.
- Onboarding driver mobile: flux documentaire partiel, principalement noms de fichiers/liens/preuves declarees.
- Production Render: sandbox PawaPay, notifications locales, stockage documents local `/tmp`, seed demo au build.

## Tableau des constats

| ID | Gravite | Application | Fichier | Composant ou fonction | Constat | Impact | Correction recommandee |
|---|---|---|---|---|---|---|---|
| ORBI-AUD-001 | P0 | backend | `apps/backend/src/core/realtime/realtime.gateway.ts` | `handleMessage` / `handleSubscribe` | Le WebSocket accepte `subscribe` avec `role`, `actorId`, `riderId`, `driverId` fournis par le client sans valider la session. | Exposition possible d'evenements temps reel d'autres utilisateurs; bloque tout deploiement public. | Authentifier le handshake WS, verifier token/session et calculer les scopes cote serveur. |
| ORBI-AUD-002 | P0 | backend/API | `apps/backend/src/modules/drivers/drivers.controller.ts` | `GET /drivers/preview-offers` | Route publique non gardee retournant les offres preview. | Risque de fuite d'offres, demandes actives et donnees operationnelles. | Protections `SessionAuthGuard`, roles driver/admin/ops, rate limit scope utilisateur, et minimisation de donnees. |
| ORBI-AUD-003 | P0 | deploy | `render.yaml` | `buildCommand` | Le build Render execute `pnpm --filter backend prisma:seed`. | Creation ou mise a jour de comptes demo sur l'environnement deploye; risque majeur si DB production. | Retirer le seed du build deploiement, le reserver a un profil local/CI isole. |
| ORBI-AUD-004 | P0 | backend | `apps/backend/prisma/seed.ts` | seed demo users | Comptes `admin@orbi.app`, `rider@orbi.app`, `driver@orbi.app` avec mot de passe connu `Orbi123!`. | Comptes predictibles si seed execute hors local. | Rendre le seed impossible en production et generer des secrets uniques uniquement dans des environnements jetables. |
| ORBI-AUD-005 | P0 | repo | lockfile / audit | `pnpm audit` | Gate production echoue: 16 vulnerabilites, 9 high, dont `fast-uri`, `brace-expansion`, `js-yaml`, `image-size`, `nanoid`. | Bloque production et beta serieuse selon le gate existant. | Mettre a jour overrides/dependances, regenerer lockfile et conserver le gate SCA bloquant. |
| ORBI-AUD-006 | P1 | backend | `apps/backend/src/modules/auth/auth.service.ts` | `deliverOtpSms` | Sans gateway SMS, le code OTP est loggue; en erreur, la livraison est logguee mais ne bloque pas forcement le succes API. | Les utilisateurs ne recoivent pas le code; fuite de codes dans logs; bloque beta serieuse. | Exiger fournisseur SMS en beta/pilote/prod, ne pas logger les OTP, retourner un etat de livraison explicite. |
| ORBI-AUD-007 | P1 | backend/payments | `apps/backend/src/modules/payments/payment-fixture-manifest.ts` | fixture manifest | Aucune fixture `sandbox_capture`; readiness paiement marquee non pilot-ready. | Paiements non prouves contre fournisseur reel; bloque pilote. | Capturer et archiver des preuves sandbox PawaPay signees, incluant succes, echec, refund, duplicate webhook. |
| ORBI-AUD-008 | P1 | backend/payments | `apps/backend/src/modules/payments/payments.service.ts` | `initiateCinetPayRefund` | Remboursement CinetPay explicitement non implemente. | Argent et support non complet si CinetPay active; bloque prod multi-provider. | Implementer refund CinetPay ou desactiver officiellement CinetPay hors developpement. |
| ORBI-AUD-009 | P1 | backend/documents | `apps/backend/src/common/document-links/document-links.service.ts` | upload/view links | Le backend signe des liens, mais aucune route reelle `documents/upload` / `documents/view` n'a ete trouvee. | Onboarding documentaire non operationnel; bloque pilote chauffeurs. | Ajouter upload binaire authentifie, stockage objet, scan, recuperation securisee et tests e2e. |
| ORBI-AUD-010 | P1 | backend/documents | `apps/backend/src/common/document-links/document-object-storage.service.ts` | object storage | Seul `local-provider` est supporte. | Documents perdus sur runtime ephemere; non conforme pour pilote/prod. | Integrer S3/R2/Supabase Storage ou equivalent avec URLs signees et retention. |
| ORBI-AUD-011 | P1 | deploy | `render.yaml` | `DOCUMENT_OBJECT_PROVIDER`, `/tmp` | Render configure le stockage documents local dans `/tmp`, note comme ephemere. | Perte de documents au redemarrage; bloque pilote reel. | Remplacer par stockage objet persistant avant tout onboarding terrain. |
| ORBI-AUD-012 | P1 | mobile | `apps/rider-app/lib/privacy/screen-capture.ts`, `apps/driver-app/lib/privacy/screen-capture.ts` | `preventSensitiveScreenCapture` | Fonctions de protection capture ecran vides. | Ecrans auth, compte, recus, revenus et documents exposables par capture. | Implementer `expo-screen-capture` ou module natif selon plateforme, avec tests. |
| ORBI-AUD-013 | P1 | backend/notifications | `apps/backend/src/common/job-queue/notification-delivery.service.ts` | SMS/EMAIL/IN_APP | SMS, email et in-app restent en livraison locale; seul push Expo est appele. | Alertes securite, support et operations non fiables. | Brancher fournisseurs reels, retries, DLQ et preuve de livraison. |
| ORBI-AUD-014 | P1 | config/mobile | `packages/config/src/index.ts` | `defaultFieldApiBaseUrl` | Sans env explicite, les apps peuvent pointer vers `https://orbi-field-api.onrender.com`. | Builds locaux ou previews peuvent toucher un backend terrain par defaut. | Exiger `EXPO_PUBLIC_API_BASE_URL` par profil non local ou echouer explicitement. |
| ORBI-AUD-015 | P1 | deploy/payments | `render.yaml` | PawaPay env | Deploiement Render force `PAWAPAY_ENVIRONMENT=sandbox` et `PAYMENTS_REFUND_MODE=manual`. | Pas de flux argent reel automatise; bloque production. | Separateur clair staging/prod, live credentials, refund policy operationnelle et runbook ops. |
| ORBI-AUD-016 | P1 | backend | `apps/backend/src/config/environment.validation.ts` | production config | Validation production solide, mais beaucoup de valeurs par defaut dev restent dans `configuration.ts` et `.env.example`. | Une mauvaise variable d'environnement peut activer des comportements dev hors local si `NODE_ENV` est mal pose. | Ajouter gates par profil de deploiement et tests de config pour staging/pilot/prod. |
| ORBI-AUD-017 | P1 | backend | `apps/backend/src/modules/voice/voice.service.ts` | intent/location parsing | Fonction voice basee sur heuristiques et landmarks statiques. | Experience vocale non fiable sur terrain; risque d'adresses incorrectes. | Marquer experimental, ajouter geocoder/STT robuste, confirmation utilisateur et logs d'ambiguite. |
| ORBI-AUD-018 | P1 | backend | `apps/backend/src/main.ts` | `unhandledRejection` | Les rejets non geres sont loggues sans arret du processus. | Etat serveur potentiellement incoherent apres erreur asynchrone grave. | En production, logger, flush telemetry et terminer proprement pour restart supervise. |
| ORBI-AUD-019 | P1 | backend/lint | `apps/backend/package.json` | `lint` | Le script lint backend corrige avec `--fix`; lint non-mutant observe en echec avec ~1009 problemes. | Qualite non stabilisee; gate lint racine est mutateur. | Ajouter `lint:check`, corriger format/TS lint, rendre CI non-mutante. |
| ORBI-AUD-020 | P2 | admin | `apps/admin-web/app/admin-realtime.ts` | SSE proxy | Admin realtime passe par route serveur authentifiee; depend de la securite backend et de SSE reconnect. | Bon pour interne, mais resilience/observabilite a renforcer. | Ajouter tests e2e de reconnexion, backpressure et permissions temps reel. |
| ORBI-AUD-021 | P2 | frontend/mobile | `apps/driver-app/app/(tabs)/profil.tsx` | documents | Le profil prepare des liens et declare des artefacts, mais aucun upload binaire complet n'a ete identifie. | Chauffeurs peuvent soumettre des preuves non verifiees. | Integrer picker fichier/camera, upload effectif, checksum, statut scan et retry. |
| ORBI-AUD-022 | P2 | frontend/mobile | `apps/driver-app/app/onboarding.tsx` | onboarding wizard | Flux separe a base de checkboxes documentaires. | Risque de confusion et donnees documentaires insuffisantes. | Unifier le flux onboarding autour du statut backend et des preuves reelles. |
| ORBI-AUD-023 | P2 | frontend/mobile | `apps/rider-app/lib/place-search.tsx` | search Nominatim | Appel direct a Nominatim depuis le mobile avec fallback local. | Dependances reseau dispersees, privacy/rate-limit hors controle Orbi. | Centraliser la recherche lieux via backend avec cache, quotas et politique donnees. |
| ORBI-AUD-024 | P2 | packages/ui | `packages/ui/src/use-network-status.ts` | connectivity check | Verification reseau via `https://clients3.google.com/generate_204`. | Dependance externe non documentee; faux positifs selon reseaux locaux. | Proposer endpoint health Orbi configurable avec fallback explicite. |
| ORBI-AUD-025 | P2 | packages/ui/backend | `packages/ui/src/use-websocket-realtime-stream.ts`, `apps/backend/src/core/realtime/realtime.gateway.ts` | realtime contract | Contrat de subscription duplique et permissif entre client et serveur. | Drift de contrat et erreurs de scoping possibles. | Deplacer le protocole WS dans `packages/api` ou `packages/domain`, avec schema runtime. |
| ORBI-AUD-026 | P2 | packages/config | `packages/config/src/index.ts` | `executionPhases` | Statuts de roadmap semblent obsoletes par rapport au code reel. | Documentation runtime trompeuse pour decision produit. | Mettre a jour la verite produit et distinguer shipped/flagged/dev-only. |
| ORBI-AUD-027 | P2 | backend | `apps/backend/src/core/realtime/configurable-realtime.transport.ts` | Redis adapter | `redis` est accepte comme config supportee mais degrade car non implemente. | Confusion ops et risque mauvais choix infrastructure. | Retirer Redis des options supportees ou implementer l'adapter. |
| ORBI-AUD-028 | P2 | backend/packages | `apps/backend/package.json` | `ioredis`, overrides | Dependances liees a Redis existent alors que le transport Redis est non operationnel. | Dette dependency/surface SCA inutile possible. | Auditer dependances inutilisees avec `depcheck` ou equivalent avant beta. |
| ORBI-AUD-029 | P2 | backend/payments | `apps/backend/src/modules/payments/payments.service.ts` | generic webhooks | Webhooks generiques acceptables seulement avec secret; provider signatures moins strictes hors production. | Staging/pilote mal configure peut accepter des payloads faibles. | Exiger signatures en tout environnement partage et isoler local explicitement. |
| ORBI-AUD-030 | P2 | mobile/admin | `apps/*/eas.json`, `apps/*/_layout.tsx` | debug crash details | Profils field/debug peuvent activer details crash visuels; tests verifient certains garde-fous mais la surface existe. | Fuite potentielle d'informations techniques sur builds non-prod distribues. | Verrouiller debug details a des builds internes signes, jamais field/pilot. |
| ORBI-AUD-031 | P2 | backend | `apps/backend/src/common/job-queue/document-safety-scanner.service.ts` | local policy scanner | Scan documentaire limite a extension/taille/hash/verification objet, pas antivirus ni controle identite. | Acceptable en manuel ferme, insuffisant pour extension. | Ajouter antivirus, detection type MIME reelle, revue manuelle outillee et audit trail complet. |
| ORBI-AUD-032 | P2 | frontend | `apps/rider-app/app/book.tsx`, `apps/rider-app/app/(tabs)/activity.tsx` | compat/legacy stubs | Presence de stubs de compatibilite internes. | Dette UI et risque de comportements masques. | Supprimer ou isoler derriere tests quand les flux actuels sont stabilises. |
| ORBI-AUD-033 | P2 | frontend/mobile | `apps/driver-app/app/(tabs)/accueil.tsx`, `apps/driver-app/app/(tabs)/offres.tsx` | fatigue/default status | Statuts fatigue/raison par defaut codes en dur avant donnees live. | Peut afficher un etat rassurant non prouve. | Distinguer explicitement `unknown`, `loading`, `verified clear` et donnees backend. |
| ORBI-AUD-034 | P2 | repo | `apps/*`, `packages/*` | `as any`, `: any` | Plusieurs casts `as any` dans navigation, WebView, styles et donnees. | Type safety affaiblie dans UI critique. | Remplacer par types Expo Router/WebView/StyleSheet et schemas partages. |
| ORBI-AUD-035 | P2 | repo | apps mobiles, packages | i18n/session/network helpers | Logique i18n, auth/session et realtime dupliquee entre rider/driver et packages. | Drift fonctionnel et corrections appliquees deux fois. | Extraire les patterns vraiment communs dans packages partages sans sur-abstraire. |
| ORBI-AUD-036 | P2 | CI/CD | `.github/workflows/ci.yml` | `pnpm prisma:seed` | CI seed apres migrate; acceptable si DB ephemere mais dangereux si env reutilise. | Risque de pollution de donnees si secrets CI pointent vers DB partagee. | Ajouter garde `ALLOW_SEED=true` et verifier host DB jetable. |
| ORBI-AUD-037 | P2 | Docker | `deploy/staging/docker-compose.yml` | staging stack | Staging mieux isole, seed en profil dedie, mais depend de secrets externes et volumes locaux. | Bon support local/staging, pas preuve production. | Documenter runbook staging et ajouter smoke e2e post-deploiement. |
| ORBI-AUD-038 | P2 | backend | `apps/backend/src/modules/payments/payments.service.ts` | wallet ledger | Ledger wallet idempotent present, mais besoin d'e2e financier bout-en-bout avec vrais webhooks. | Risque de reconciliation sous concurrence et incidents provider. | Ajouter tests de charge/idempotence DB, reconciliation ops et exports comptables. |
| ORBI-AUD-039 | P2 | admin | `apps/admin-web` | operations boards | Admin couvre beaucoup de surfaces, mais l'efficacite depend de jobs/notifications/document storage non finalises. | Ops peut voir des etats sans pouvoir finaliser un cas terrain. | Relier chaque board critique a une action auditee et une preuve backend. |
| ORBI-AUD-040 | P3 | repo/docs | `docs`, `packages/config` | docs/status | Documentation abondante mais certains statuts semblent en decalage avec le code. | Decisions produit moins fiables. | Maintenir une matrice "implemented / simulated / dev-only / field-ready". |

## Donnees fictives, demo et developpement

- Donnees fictives confirmees: seed Prisma avec comptes demo et vehicules demo; fixtures paiement sans capture fournisseur; landmarks voice statiques; fallback local de lieux; donnees de preview/offers selon etat DB.
- Ecrans ou chemins de demonstration/developpement: scripts `demo:*`, workflows locaux, profils EAS field/debug, Visual QA session readiness dans les tests/configs mobiles.
- Fonctions vides ou stubs: protection capture ecran mobile no-op; compat/legacy stubs dans rider booking/activity; remboursement CinetPay non implemente.
- Secrets potentiels: pas de cle privee ou secret provider detecte par le gate d'hygiene; presence de secrets de developpement dans exemples/defaults et comptes demo seedes.
- Valeurs dangereuses par defaut: API field par defaut dans `packages/config`, webhooks/dev secrets locaux dans config backend, PawaPay sandbox et notifications locales dans Render.

## Routes et protections

- Protections solides: routes admin, rider, driver, trips, ride requests et paiements principaux utilisent largement `SessionAuthGuard`, `RolesGuard`, `ProfileAccessGuard`, rate limits et audit logs.
- Routes publiques attendues: health, pricing, vehicles, auth OTP/sign-in/sign-up, payment webhooks.
- Routes publiques a corriger: WebSocket realtime sans auth effective; `GET /drivers/preview-offers` non garde.
- Webhooks: PawaPay a verification HMAC; webhooks generiques necessitent une rigueur de configuration pour les environnements partages.

## Paiements et portefeuille

- Fonctionnel localement: creation de checkout, idempotence, wallet transactions, top-up, ledger, webhooks, replay et remboursement manuel.
- Simule ou incomplet: preuve fournisseur manquante, PawaPay sandbox en deploiement field, refund CinetPay absent, reconciliation production a renforcer.
- Bloque beta/pilote: sans captures sandbox et runbook financier, le flux argent ne doit pas etre expose a des utilisateurs externes.

## Temps reel

- Transport backend et hooks frontend existent, avec tests de filtrage service-level.
- Le gateway public ne valide pas l'identite des abonnes. Cette faille domine tous les benefices actuels du temps reel.
- En production, `REALTIME_ADAPTER=postgres` et `REALTIME_STRICT=true` sont exiges par validation, ce qui est positif.

## Tests et CI/CD

- Tests existants solides pour backend, admin smoke, mobile smoke, Prisma et production readiness specs.
- Gate production echoue sur audit SCA avant d'atteindre Prisma, backend readiness, fixtures, smoke et typecheck.
- Lint backend doit devenir non-mutant et vert avant beta.
- Les tests critiques manquants concernent surtout: WebSocket auth handshake, upload documentaire binaire, provider paiement sandbox, SMS delivery failure, seed impossible en production, routes publiques sensibles.

## Risques par niveau de deploiement

- Bloque tout deploiement public: WebSocket non authentifie, route preview offers publique, seed demo dans Render, vulnerabilites high.
- Bloque beta serieuse: OTP/SMS non fiable, screen privacy no-op, documents non reels, lint backend rouge, defaults field/dev trop permissifs.
- Bloque pilote limite: pas de stockage documents persistant, pas de captures sandbox paiement, notifications hors push non reelles, runbooks financiers/documentaires incomplets.
- Bloque production: paiements live/refunds/reconciliation incomplets, SCA rouge, stockage local, debug/defaults a verrouiller, tests e2e provider et realtime insuffisants.

## Recommandation finale

Etat recommande aujourd'hui: pret pour tests internes.

Orbi peut continuer en developpement local et en sessions internes controlees avec donnees factices. Il ne doit pas etre ouvert en beta controlee, pilote limite ou production tant que les P0 et P1 ci-dessus ne sont pas traites et que le gate production ne repasse pas au vert.
