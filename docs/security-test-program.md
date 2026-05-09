# Mobilis Security And Reliability Test Program

Date de reference: 9 mai 2026

Ce programme transforme la checklist type Uber/Yango en controles executables,
preuves attendues et criteres de sortie pour Mobilis. Il s'appuie sur:

- OWASP WSTG: https://owasp.org/www-project-web-security-testing-guide/
- OWASP API Security Top 10 2023: https://owasp.org/API-Security/
- OWASP MASVS: https://mas.owasp.org/MASVS/
- OWASP MASTG: https://mas.owasp.org/MASTG/
- NIST SSDF SP 800-218: https://csrc.nist.gov/pubs/sp/800/218/final

## Gate De Lancement

Mobilis ne passe pas en production large tant que ces gates ne sont pas verts:

| Gate | Statut attendu | Preuve |
| --- | --- | --- |
| G1 API/backend | Automatisation locale verte | `pnpm --filter backend test -- --runInBand` |
| G2 Web/admin | Smoke admin + build vert | `pnpm test:admin:smoke`, `pnpm typecheck` |
| G3 Mobile | Smoke rider/driver + test appareils reels | `pnpm test:mobile:smoke`, fiche lab Android/iOS signee |
| G4 SCA/dependances | Zero vulnerabilite connue >= moderate | `pnpm audit --audit-level moderate` |
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
| Auth, RBAC, session, guards | `pnpm --filter backend test -- auth --runInBand` | connexion, session, roles, presenter, guards |
| API/DTO dirty input | `pnpm --filter backend test -- dirty-input-validation.spec.ts --runInBand` | validation stricte, schema, champs inconnus |
| Paiements | `pnpm --filter backend test -- payments.service.spec.ts --runInBand` | checkout, webhook signe, replay, refund, wallet payout |
| Admin ops | `pnpm --filter backend test -- admin.service.spec.ts admin.controller.spec.ts --runInBand` | audit, finance, support, launch readiness |
| Realtime | `pnpm --filter backend test -- realtime --runInBand` | transport, degradation, publication |
| Ride/dispatch/trips | `pnpm --filter backend test -- ride trips drivers --runInBand` | matching, lifecycle, acceptance policy |
| Mobile smoke | `pnpm test:mobile:smoke` | parcours rider/driver, sessions, feedback |
| Admin smoke | `pnpm test:admin:smoke` | routes serveur, securite admin, launch readiness |
| Prisma | `pnpm --filter backend exec prisma validate` | schema valide |
| SCA | `pnpm audit --audit-level moderate` | dependances vulnerables |
| Workspace build | `pnpm typecheck` | packages, admin build, mobile typecheck, backend build |

Le gate local agregé est:

```powershell
pnpm test:security:local
```

Sur un poste ou `next build` est bloque par `spawn EPERM`, executer le gate avec
le build separe hors sandbox ou utiliser directement:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\testing\security-local-gate.ps1 -SkipTypecheck
```

## Matrice Des Tests Demandes

| Bloc | Automatisation repo | Tests manuels/lab obligatoires | Owner |
| --- | --- | --- | --- |
| 1 Web/backend auth | Auth specs, guards, rate limit, dirty input | MFA/OTP live, credential stuffing controle, vol/fixation session avec proxy | Security/backend |
| 1 Autorisation | roles/profile guards, admin specs, opaque id pipe | BOLA/IDOR exhaustif sur tous objets avec Burp/ZAP | Security/backend |
| 1 API Top 10 | DTO validation, rate limit, feature flags, security headers | DAST API complet, inventaire endpoints, SSRF et mass assignment offensifs | Security/API |
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
4. Admin: toute action finance, onboarding, support, pricing ou incident doit
   etre role-bound, no-store, auditee et visible en realtime ops.
5. Mobile: aucun token/session ne doit apparaitre dans logs, stockage clair,
   screenshots sensibles, clipboard ou deep links non controles.

## Commandes Executees Le 9 Mai 2026

| Commande | Resultat |
| --- | --- |
| `pnpm --filter backend test -- --runInBand` | 44 suites, 368 tests passed |
| `pnpm test:mobile:smoke` | rider 25 tests passed, driver 28 tests passed |
| `pnpm test:admin:smoke` | 4 suites, 22 tests passed |
| `pnpm --filter backend exec prisma validate` | schema valide |
| `pnpm audit --audit-level moderate` | no known vulnerabilities after overrides |

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
