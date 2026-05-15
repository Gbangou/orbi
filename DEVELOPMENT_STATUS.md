# Mobilis Development Status

Date de reference: 9 mai 2026

## Etat court

Mobilis dispose d'une fondation locale serieuse: monorepo pnpm, backend NestJS
+ Prisma, apps Expo rider/driver, admin Next.js, contrats TypeScript partages,
authentification session, RBAC, validation DTO, audit logs, health/readiness,
pricing Burkina, paiements/wallet foundations, onboarding chauffeur securise et
smokes locaux.

Le produit n'est pas encore une production large. Le bon objectif actuel reste
un pilote terrain controle avec operations manuelles de secours, preuves de
paiement provider, observabilite et runbooks verts.

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
  a une origine frontend Mobilis configuree avant persistance d une tentative.
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

1. Capturer fixtures provider paiement sandbox, surtout refund/reconciliation.
2. Brancher providers externes au worker durable: replay paiement strictement
   controle, antivirus/anti-fraude documentaire et push/SMS/email reels derriere
   les frontieres provider deja testees.
3. Adapter S3/GCS production pour objets documentaires.
4. Renforcer observabilite, alertes et dashboards capacite avant pilote large.
5. Etendre le proxy serveur admin HttpOnly aux autres actions sensibles:
   wallet/payout, refund/replay paiement, onboarding documents et dispatch.
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
pnpm --filter @mobilis/api build
pnpm --filter @mobilis/admin-web test:smoke
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
  workers webhooks/retries/dead-letter doivent etre prouves avec fixtures
  provider.
- La production ne doit pas etre declaree "large" sans CI verte, observabilite,
  rollback pratique, secrets production, URLs externes HTTPS et validation
  terrain repetee.
- Les clients mobiles conservent le modele Bearer token pour Expo; l'admin web
  commence sa migration vers routes serveur + cookie HttpOnly, mais toutes les
  actions sensibles doivent suivre ce modele avant exposition publique large.
- Le backend refuse maintenant les identifiants admin et mobiles malformes
  avant Prisma; les controles IDOR metier restent assures par les requetes
  scoping existantes, et doivent continuer a etre testes par role.
