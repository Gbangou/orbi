# Orbi - Gates CI/CD

Date: 2026-08-10  
Objectif: rendre les gates critiques executables et bloquantes.

## Workflows

| Workflow | Fichier | Declencheurs | Statut |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | Pull request, push `main` | Gate principale avec Postgres, tests, builds et smoke. |
| Production Readiness Gate | `.github/workflows/production-readiness-gate.yml` | Pull request, push `main`, manuel | Gate production plus stricte via `pnpm test:production:gate`. |

## Gates ajoutees ou consolidees

| Gate | Commande | Bloquant | Couverture |
| --- | --- | --- | --- |
| Installation verrouillee | `pnpm install --frozen-lockfile` | Oui | Empêche drift lockfile/dependances. |
| Dependency audit | `pnpm audit --audit-level high` | Oui | Vulns hautes et critiques. |
| Format check | `pnpm format:check` | Oui | `git diff --check`; whitespace et conflits de patch. |
| Lint check non-mutant | `pnpm lint:check` | Oui | ESLint/tsc sans `--fix`; actuellement rouge a cause de dette existante. |
| Source risk | `pnpm test:source-risk` | Oui | `catch` vides, actions no-op, mocks runtime evidents, logs bruts, suppressions TS. |
| Secret/privacy source | `pnpm test:security:source` | Oui | Console runtime, tokens, AsyncStorage/localStorage, secrets hardcodes. |
| Prisma generate | `pnpm prisma:generate` | Oui | Client Prisma coherent. |
| Prisma validate | `pnpm --filter backend exec prisma validate` | Oui | Schema valide. |
| Migration deploy | `pnpm --filter backend exec prisma migrate deploy` | Oui | Migrations applicables sur Postgres CI. |
| Migration status | `pnpm --filter backend exec prisma migrate status` | Oui | Detecte drift/applied state incoherent. |
| Backend tests | `pnpm --filter backend exec jest --runInBand --ci --forceExit` | Oui | Unitaires/integration backend. |
| Admin smoke | `pnpm test:admin:smoke` | Oui | Composants et flux admin principaux. |
| Mobile smoke | `pnpm test:mobile:smoke` | Oui | Rider/Driver smoke. |
| Typecheck/build workspace | `pnpm typecheck` | Oui | Packages, apps, backend build Nest. |
| Backend build explicite | `pnpm build:backend` | Oui | Build Nest production. |
| Admin build explicite | `pnpm build:admin` | Oui | `next build`. |
| Rider bundle CI | `pnpm build:rider:ci` | Oui | `expo export --platform web`; bundle JS/assets Rider. |
| Driver bundle CI | `pnpm build:driver:ci` | Oui | `expo export --platform web`; bundle JS/assets Driver. |
| Backend API smoke | script local API smoke CI | Oui | Health + parcours argent minimal. |
| Production readiness | `pnpm test:production:gate` | Oui | Secret hygiene, Prisma, readiness specs, fixtures paiement, smoke, typecheck. |

## Gates explicitement non couvertes par CI standard

| Gate | Raison | Decision |
| --- | --- | --- |
| APK Android Rider/Driver | Necessite toolchain Android/EAS credentials et duree longue | Gate release separee: `pnpm mobile:apk:rider` et `pnpm mobile:apk:driver` avant pilote. |
| Tests appareils reels GPS/background | Depend de hardware, permissions OS et batterie | Campagne terrain + smoke manuel documente. |
| Provider mobile money reel | Depend credentials sandbox/production et webhooks publics | Sandbox provider obligatoire avant pilote, production avant go-live. |
| Antivirus upload reel | Architecture/provider a confirmer | Gate future avant production documents. |

## Etat actuel des gates locales

| Commande | Resultat observe |
| --- | --- |
| `pnpm quality:source` | OK. |
| `pnpm format:check` | OK; avertissements CRLF Git sur fichiers existants. |
| `pnpm typecheck` | OK. |
| `pnpm --filter backend exec prisma validate` | OK. |
| `pnpm --filter backend test -- pricing.service.spec.ts ride-request-creation.policy.spec.ts trip-acceptance.policy.spec.ts payments.service.spec.ts wallet-topup.service.spec.ts --runInBand` | OK, 137 tests. |
| `pnpm build:admin` | OK hors sandbox; sandbox locale bloque `spawn` avec `EPERM`. |
| `pnpm build:rider:ci` | OK hors sandbox; genere `apps/rider-app/dist-ci/`, ignore par Git. |
| `pnpm build:driver:ci` | OK hors sandbox; genere `apps/driver-app/dist-ci/`, ignore par Git. |
| `pnpm lint:check` | KO: 1803 problemes backend, surtout Prettier et quelques `unsafe-*`. Gate volontairement bloquante. |

## Politique d'echec

Une gate critique doit echouer le pipeline avec un code de sortie non nul. Les workflows n'utilisent pas `continue-on-error` pour les gates ci-dessus.

Regle de triage:

- P0: tests argent, auth, autorisation, Prisma, migration, secret/source risk, typecheck, backend build.
- P1: admin build, mobile smoke, Expo bundle, smoke API local.
- P2: lint complet tant que la dette historique n'est pas nettoyee; devient P1 apres remise au vert.

## Corrections apportees

- Ajout de `scripts/testing/source-risk-gate.mjs`.
- Ajout des scripts racine `lint:check`, `format:check`, `quality:source`, `build:*`.
- Ajout de `build:ci` Rider/Driver avec bundle Expo web.
- Branchement CI des gates lint, format, source risk, migration status, builds backend/admin/mobile.
- Ajout de `apps/rider-app/dist-ci/` et `apps/driver-app/dist-ci/` au `.gitignore`.
