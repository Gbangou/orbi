# Orbi Security And Reliability Test Program

Date de reference: 10 mai 2026

Ce programme transforme la checklist type Uber/Yango en controles executables,
preuves attendues et criteres de sortie pour Orbi. Il s'appuie sur:

- OWASP WSTG: https://owasp.org/www-project-web-security-testing-guide/
- OWASP API Security Top 10 2023: https://owasp.org/API-Security/
- OWASP MASVS: https://mas.owasp.org/MASVS/
- OWASP MASTG: https://mas.owasp.org/MASTG/
- NIST SSDF SP 800-218: https://csrc.nist.gov/pubs/sp/800/218/final

## Discipline Continue Par Defaut

Chaque changement Orbi doit etre traite comme un changement de produit
critique: on ajoute ou on ajuste les tests au meme moment que le code, sans
attendre une phase separee. La boucle minimale est:

1. identifier les actifs touches: compte, session, trajet, position, paiement,
   document KYC, admin action, log, notification ou export;
2. mapper le changement aux controles OWASP WSTG, OWASP API Top 10, MASVS/MASTG
   et NIST SSDF pertinents;
3. ajouter le test automatisable le plus proche dans le repo;
4. noter les tests lab/offensifs qui ne peuvent pas etre executes localement;
5. executer les tests cibles puis `pnpm typecheck` avant de considerer le
   changement termine.

Pour Orbi, les flux sensibles OWASP API6:2023 sont explicitement inclus:
creation massive de comptes, abus promotions/parrainage, spam OTP, scraping
chauffeurs, demandes de courses automatisees, annulations repetees, exports
admin, remboursements, replays webhooks, bascule disponibilite chauffeur et
changements tarifaires.

## Gate De Lancement

Orbi ne passe pas en production large tant que ces gates ne sont pas verts:

| Gate | Statut attendu | Preuve |
| --- | --- | --- |
| G1 API/backend | Automatisation locale verte | `pnpm --filter backend test -- --runInBand` |
| G2 Web/admin | Smoke admin + build vert | `pnpm test:admin:smoke`, `pnpm typecheck` |
| G3 Mobile | Smoke rider/driver + test appareils reels | `pnpm test:mobile:smoke`, fiche lab Android/iOS signee |
| G4 SCA/dependances | Zero vulnerabilite connue >= moderate; erreur registre audit traitee comme indisponibilite fournisseur | `pnpm audit --audit-level moderate --ignore-registry-errors` |
| G5 Prisma/donnees | Schema valide + invariants verts | `pnpm --filter backend exec prisma validate` |
| G6 Paiements | Mobile Money, webhook, refund, wallet, export | `pnpm e2e:local-api`, runbook field session |
| G7 Pentest | API, mobile, admin, paiement | Rapport externe avec corrections P0/P1 fermees |
| G8 Resilience | pannes DB/realtime/paiement/SMS/carte | rapport chaos/preprod |
| G9 Cloud/SOC | IAM, secrets, logs, alertes, incident response | rapport cloud/SOC |
| G10 Legal/privacy | consentement, retention, DSR, KYC | revue juridique/ops |

## Couverture Automatisee Locale

Ces tests sont directement executables dans le repo:

| Domaine | Commande | Couvre |
| --- | --- | --- |
| Auth, RBAC, session, guards | `pnpm --filter backend test -- auth --runInBand` | connexion, session, roles, presenter, guards, session chauffeur appareil unique |
| API/DTO dirty input | `pnpm --filter backend test -- dirty-input-validation.spec.ts --runInBand` | validation stricte, schema, champs inconnus |
| Paiements | `pnpm --filter backend test -- payments.service.spec.ts --runInBand` | checkout, webhook signe, replay, refund, wallet payout |
| Admin ops | `pnpm --filter backend test -- admin.service.spec.ts admin.controller.spec.ts --runInBand` | audit, finance, support, launch readiness |
| Realtime | `pnpm --filter backend test -- realtime --runInBand` | transport, degradation, publication |
| File durable | `pnpm --filter backend test -- job-queue notifications --runInBand` | claim borne, recovery RUNNING orphelin, idempotence notification/provider, scanner documentaire, references webhook/document, retry/dead-letter |
| Ride/dispatch/trips | `pnpm --filter backend test -- ride trips drivers --runInBand` | matching, lifecycle, acceptance policy |
| Mobile smoke | `pnpm test:mobile:smoke` | parcours rider/driver, sessions, feedback |
| Admin smoke | `pnpm test:admin:smoke` | routes serveur, securite admin, launch readiness |
| Prisma | `pnpm --filter backend exec prisma validate` | schema valide |
| SCA | `pnpm audit --audit-level moderate --ignore-registry-errors` | dependances vulnerables; fournisseur audit indisponible |
| Workspace build | `pnpm typecheck` | packages, admin build, mobile typecheck, backend build |

Le gate local agregé est:

```powershell
pnpm test:security:local
```

La preuve production portable est:

```powershell
pnpm test:production:gate
```

Elle est aussi appelee par le workflow GitHub Actions `Production Readiness Gate`
sur les pull requests et sur `main`.
Ce gate execute aussi `pnpm test:payments:fixtures` afin que les fixtures
webhooks/refunds et leur manifeste restent executables avant toute decision de
pilote. Utiliser `--skip-payment-fixtures` uniquement pour diagnostiquer un
autre blocage du gate, pas pour valider une release.

Sur un poste ou `next build` est bloque par `spawn EPERM`, executer le gate avec
le build separe hors sandbox ou utiliser directement:

```powershell
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\testing\security-local-gate.ps1 -SkipTypecheck
```

## Matrice Des Tests Demandes

| Bloc | Automatisation repo | Tests manuels/lab obligatoires | Owner |
| --- | --- | --- | --- |
| 1 Web/backend auth | Auth specs, guards, rate limit, dirty input | MFA/OTP live, credential stuffing controle, vol/fixation session avec proxy | Security/backend |
| 1 Autorisation | roles/profile guards, admin specs, opaque id pipe | BOLA/IDOR exhaustif sur tous objets avec Burp/ZAP | Security/backend |
| 1 API Top 10 | DTO validation, rate limit, feature flags, security headers | DAST API complet, inventaire endpoints, SSRF et mass assignment offensifs | Security/API |
| 1 API6 flux sensibles | rate limit, audit, feature flags, business guards | abus promos/parrainage/OTP, creation massive, scraping, remboursement abuse | Fraud/security |
| 2 Mobile MASVS/MASTG | smoke rider/driver, session-feedback, SecureStore paths | reverse APK/IPA, stockage local, root/jailbreak, pinning, deep links, permissions | Mobile security |
| 3 Geo/cartes | route metrics, dispatch, pricing, presence tests | GPS spoofing, trajet impossible, zones interdites, privacy realtime sur appareils | Fraud/geo |
| 4 Realtime | realtime transport/service specs, degraded mode | WebSocket auth, channel isolation, replay/injection sous proxy | Realtime/backend |
| 5 Paiements | payments specs, local API E2E, audit finance | sandbox Flutterwave/CinetPay/Orange/Moov/Coris/LigdiCash, PCI si carte | Finance/security |
| 6 Donnees personnelles | dirty input, document links, redaction admin | chiffrement au repos, KYC object storage, DSR export/delete, retention logs | Privacy/legal |
| 7 Admin/back-office | admin service/controller/smoke, audit logs | MFA admin, double validation critique, export massif, super admin transfer | Ops/security |
| 8 Securite rider/driver | onboarding tests, SOS/incident/trip sharing specs | faux documents, multi-comptes, harcelement messagerie, preuve arrivee/fin | Trust & safety |
| 9 Anti-fraude | pricing/dispatch/ride lifecycle tests | collusion, promo abuse, GPS fake, cancellations, risk scoring terrain | Fraud |
| 10 Performance | unit/integration only today | k6/Artillery/JMeter, 10k/100k/1M scenarios, DB profiling, battery/data | Platform |
| 11 Resilience | health/watchdog/job queue/realtime degraded specs | chaos preprod: DB, Redis, SMS, payment, maps, rollback, restore | SRE |
| 12 Cloud/DevOps | env validation, SCA, build | IAM, buckets, ports, WAF, DDoS, container/IaC scanning, secrets Git history | DevSecOps |
| 13 Code/SDLC | tests, typecheck, audit | SAST, DAST, IAST, SBOM, fuzzing, threat model signoff | Engineering |
| 14 UX/accessibilite | mobile/admin smoke | appareils anciens, petits ecrans, langues locales, mauvaise connexion | Product/QA |
| 15 Conformite | docs/runbooks | privacy, ToS, contrats, fiscalite, assurance, autorites, breach notification | Legal/ops |
| 16 Offensif controle | aucune execution locale sans mandat | pentest web/API/mobile/cloud/reseau/admin/paiement, red/purple team | External security |
| 17 SOC/IR | health incidents, launch readiness | SIEM, EDR, WAF logs, playbooks CSIRT, forensic readiness | SOC |
| 18 Avant lancement | gates ci-dessus | 10 tests indispensables signes avant pilote public | CTO/Security/Ops |

## Scenarios Priorite Absolue

1. BOLA/IDOR: chaque objet `user`, `rideRequest`, `trip`, `paymentAttempt`,
   `wallet`, `driverDocument`, `supportTicket` doit etre teste avec un token
   d'un autre role et d'un autre proprietaire.
2. Paiement: modifier montant, devise, reference provider, webhook secret,
   signature, replay et refund doit rester idempotent et audite.
3. Geo/fraude: un chauffeur ne doit pas pouvoir gagner argent/statut avec une
   position impossible, un trajet circulaire suspect ou une presence manipulee.
   La finalisation chauffeur d'une course `IN_PROGRESS` est bloquee cote
   mobile et cote API si le dernier signal route chauffeur est absent, trop
   ancien, trop imprecis, physiquement impossible ou associe a une alerte route
   critique; la resolution manuelle reste reservee aux operations/admin.
4. Admin: toute action finance, onboarding, support, pricing ou incident doit
   etre role-bound, no-store, auditee et visible en realtime ops.
5. Mobile: aucun token/session, mot de passe, secret ou header Authorization ne
   doit apparaitre dans logs, rapports d erreur, stockage clair, screenshots
   sensibles, clipboard ou deep links non controles.
6. Auth chauffeur: une nouvelle connexion chauffeur doit revoquer les anciennes
   sessions actives du meme compte afin de reduire l usurpation operationnelle;
   les comptes rider gardent la connexion multi-appareils controlee.
7. File durable: chaque webhook, document et notification critique doit etre
   rejouable/idempotent. Un job malforme ou orphelin part en retry borne puis
   dead-letter visible aux operations, sans journaliser de donnees personnelles
   brutes. Un job `RUNNING` bloque apres crash worker doit revenir en
   `PENDING` apres seuil borne afin d eviter les pertes silencieuses.
   Les jobs `PAYMENT_WEBHOOK` retentent les references paiement inconnues et
   rejouent le webhook stocke seulement quand la tentative paiement cible existe.
   Le dispatch notification verifie l etat `sentAt` avant tout appel provider
   pour eviter un double envoi apres replay.
   Les jobs documents chauffeur recalculent un `safetyScan` rejouable depuis
   les metadonnees provider/integrite et refusent les scanners externes non
   configures.
   La console admin n affiche que des diagnostics minimises pour les jobs:
   pression retry, signaux non sensibles et action recommandee, jamais le
   payload brut de notification, paiement ou document.
   Le journal admin permet de filtrer par famille et statut pour isoler les
   quarantaines documentaires, webhooks paiement et notifications provider sans
   exporter de donnees sensibles.
   Le resume du filtre actif doit rester base uniquement sur diagnostics
   minimises: volume, pression retry, besoin d action et signal principal.
   La remise en file depuis l admin exige une confirmation contextualisee et
   reste limitee aux jobs `DEAD_LETTER`.
   La decision UI de requeue doit utiliser `canRequeueSafely`, `severity` et
   `owner` fournis par le backend, pas une inference fragile depuis du texte.
   La vue owner queue doit permettre aux responsables finance, trust-and-safety,
   ops et engineering d isoler leur charge critique sans payload brut.
   Les regles UI associees au journal jobs doivent etre couvertes par tests
   admin-web: resume, owner queue et blocage de requeue.
   Les transitions `complete`/`fail` worker doivent verifier le verrou
   `lockedAt` du claim courant pour eviter qu un ancien worker ecrase une
   recuperation ou une reprise concurrente.
8. Trust & safety trajet: SOS, incidents et liens publics doivent etre limites
   aux acteurs autorises, throttles contre les doubles taps/abus, audites avant
   diffusion live, et resolus par hash de token sans fuite de nom reel.
9. Booking: les doubles taps rider doivent etre absorbes cote mobile et cote
   API; une demande active strictement equivalente est retournee sans nouvelle
   creation ni nouvel evenement realtime.
10. Finance admin: les actions wallet/payout/recouvrement doivent etre
   idempotentes cote API et bloquees contre les doubles clics cote console.

## Commandes Executees Le 9 Mai 2026

| Commande | Resultat |
| --- | --- |
| `pnpm --filter backend test -- --runInBand` | 44 suites, 368 tests passed |
| `pnpm test:mobile:smoke` | rider 25 tests passed, driver 28 tests passed |
| `pnpm test:admin:smoke` | 4 suites, 22 tests passed |
| `pnpm --filter backend exec prisma validate` | schema valide |
| `pnpm audit --audit-level moderate --ignore-registry-errors` | no known vulnerabilities after overrides |

## Commandes Executees Le 10 Mai 2026

| Commande | Resultat |
| --- | --- |
| `pnpm --filter @orbi/rider-app typecheck` | OK |
| `pnpm --filter @orbi/driver-app typecheck` | OK |
| `pnpm test:mobile:smoke` | rider 25 tests passed, driver 28 tests passed |
| `pnpm typecheck` | OK apres correction Expo web/Metro |
| `pnpm --filter backend test -- trips.service --runInBand` | 26 tests passed apres verrous SOS/incident/share |
| `pnpm --filter backend test -- payments.service --runInBand` | 34 tests passed apres idempotence checkout et rejet webhook montant/devise |
| `pnpm --filter backend test -- ride-requests.service --runInBand` | 11 tests passed apres idempotence active booking |
| `pnpm typecheck` | OK apres garde-fous admin wallet/payout/recouvrement |
| Chrome DevTools headless `http://localhost:8081` | `/auth` rendu, aucun overlay `Uncaught Error` |
| `pnpm --filter backend test -- admin.service.spec.ts --runInBand` | 50 tests passed apres minimisation privacy de la file support |

## Regles Privacy Enforcees Localement

- Les listes support ne chargent cote Prisma que les champs utilisateur utiles
  a l affichage operationnel, jamais email, telephone, hash ou session.
- Les champs libres support affiches en admin redigent emails, telephones et
  secrets/tokens avant sortie API.
- Les noms demandeurs support sont affiches sous forme masquee pour limiter
  l exposition de donnees personnelles hors necessite operationnelle.
- La file onboarding chauffeur applique une minimisation par role: le support
  voit email, telephone, chauffeur et acteur de revue masques; admin/ops gardent
  les details requis pour les decisions KYC auditees et les exports autorises.

## Tests Non Executables Depuis Ce Poste Seul

Ces controles exigent un environnement, un mandat ou un outillage externe:

- pentest offensif web/API/mobile/cloud/reseau/social engineering
- tests MASVS complets sur APK/IPA signes, appareils root/jailbreak et proxy lab
- tests PCI-DSS carte bancaire
- tests cloud IAM/WAF/DDoS/Kubernetes/IaC si l'infra cible existe
- tests charge 10k/100k/1M utilisateurs
- tests SOC/SIEM/EDR avec pipeline logs production-like
- revue juridique locale/internationale

Chaque controle non local doit produire: scope, date, environnement, donnees de
test, resultats, severite, owner, correction, re-test et decision de risque.
