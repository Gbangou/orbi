# Mobilis

Mobilis est une plateforme de mobilite cross-platform pensee pour un lancement en francais au Burkina Faso.

## Monorepo

```text
apps/
  backend
  rider-app
  driver-app
  admin-web
packages/
  api
  config
  domain
  ui
```

## Direction produit

- Backend: NestJS + Prisma + PostgreSQL
- App passager: Expo / React Native pour Android, iPhone et web
- App chauffeur: Expo / React Native pour Android, iPhone et web
- Admin web: Next.js
- Lancement initial: francais, Burkina Faso
- Extension future: anglais et autres marches

## Direction experience

- Une seule plateforme pour motos et voitures
- Recherche vocale et intention de destination en francais
- Parcours premium pour passagers, chauffeurs et operations
- Base technique partagee entre mobile et web

## Execution

- feuille de route active: `EXECUTION_PLAN.md`
- preview live web/mobile: `LIVE_PREVIEW.md`
- guide local pas a pas: `docs/local-development.md`
- diagramme de classes: `docs/architecture/class-diagram.md`
- diagramme de cas d'utilisation: `docs/architecture/use-case-diagram.md`
- invariants de donnees: `docs/architecture/data-invariants.md`
- architecture runtime: `docs/architecture/runtime-architecture.md`
- priorite immediate: fondations partagees, securite, auth reelle et integration front-back
- runbook de deploiement production: `docs/deployment-runbook.md`
- contexte agent/projet: `AGENTS.md`
- directive production: `docs/production-readiness-directive.md`
- version control: `docs/version-control.md`

## Demarrage rapide

```bash
pnpm install
pnpm setup:local
pnpm db:start
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev:full-web
pnpm dev:web-driver-preview
pnpm typecheck
```

## Notes locales

- PostgreSQL local tourne sur `localhost:5433`
- `dev:full-web` lance backend + admin + rider web
- `dev:web-driver-preview` lance backend + admin + driver web
- comptes demo seedes: `admin@mobilis.app`, `driver@mobilis.app`, `rider@mobilis.app`
- mot de passe demo: `Mobilis123!`
