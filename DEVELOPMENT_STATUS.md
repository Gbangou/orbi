# Mobilis Development Status

Date de reference: 8 mai 2026

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

1. Brancher les workers de consommation sur la queue durable: replay webhooks,
   scan documentaire externe et envoi provider notifications.
2. Capturer fixtures provider paiement sandbox, surtout refund/reconciliation.
3. Brancher un scan antivirus/anti-fraude documentaire externe sur `safetyScan`.
4. Adapter S3/GCS production pour objets documentaires.
5. Renforcer observabilite, alertes et dashboards capacite avant pilote large.
6. Etendre le proxy serveur admin HttpOnly aux autres actions sensibles:
   wallet/payout, refund/replay paiement, onboarding documents et dispatch.
7. Ajouter des tests IDOR par role sur les routes rider/driver/trip maintenant
   que les identifiants malformes sont rejetes avant la logique metier.

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
