# Orbi Repository Map

Date de reference: 2 juillet 2026

Cette carte decrit la structure cible actuelle du monorepo et les limites de
responsabilite entre applications, packages partages et documentation.

## Vue d'ensemble

```text
orbi/
  apps/
    backend/          NestJS API, Prisma, auth, dispatch, payments, admin, health
    admin-web/        Next.js console operations, onboarding, pricing, support
    rider-app/        Expo rider app: auth, booking, ride active, payments
    driver-app/       Expo driver app: onboarding, disponibilite, offres, revenus
    mobile-shared/    Utilitaires Expo partages par rider et driver
  packages/
    api/              Contrats et client TypeScript partages
    config/           Configuration runtime partagee et constantes
    domain/           Enums, pricing Burkina, vocabulaire metier canonique
    ui/               Tokens/design helpers partages
  docs/
    architecture/     Invariants, diagrammes, runtime, carte repo
    *.md              Runbooks, strategie, securite et execution
  scripts/
    testing/          Smokes locaux et terrain
```

Orbi est volontairement organise en monorepo applicatif: les applications
deployables vivent dans `apps/*`, les briques partagees vivent dans
`packages/*`, et les scripts/runbooks restent au niveau racine. Cette
separation permet de faire evoluer le backend, l'admin web, le rider et le
driver sans dupliquer les types metier, les contrats API ou les tokens UI.

## Regles de dependance

| Depuis | Peut dependre de | Ne doit pas dependre de |
| --- | --- | --- |
| `apps/backend` | `packages/domain`, `packages/api` types si utile | UI web/mobile |
| `apps/admin-web` | `packages/api`, `packages/domain`, `packages/ui` | Prisma direct, services backend internes |
| `apps/rider-app` | `packages/api`, `packages/domain`, `packages/ui`, `apps/mobile-shared` | Admin web, Prisma |
| `apps/driver-app` | `packages/api`, `packages/domain`, `packages/ui`, `apps/mobile-shared` | Admin web, Prisma |
| `packages/api` | Types stables et primitives transport | React, NestJS runtime, Prisma client |
| `packages/domain` | Aucune app | Transport HTTP, UI |

## Politique de packages

- `apps/backend` est le serveur. Il possede Prisma, les migrations, les
  services metier, les guards, les audits, les jobs et les integrations.
- `apps/admin-web`, `apps/rider-app` et `apps/driver-app` sont des clients. Ils
  ne lisent jamais directement la base de donnees et passent par les contrats
  HTTP/realtime.
- `packages/domain` contient le vocabulaire metier canonique: enums, statuts,
  categories vehicules, pricing Burkina et invariants purs.
- `packages/api` contient les DTO/clients partages et ne doit pas importer de
  runtime frontend ou backend lourd.
- `packages/config` centralise la lecture de configuration partagee.
- `packages/ui` expose les tokens et composants reutilisables sans tirer de
  dependance serveur.
- `apps/mobile-shared` contient uniquement les utilitaires communs rider/driver
  qui sont specifiques a Expo/mobile.

La racine `package.json` sert d'orchestrateur: elle installe les dependances du
workspace, lance les tests globaux et garde les overrides de securite. Les
dependances propres a chaque app restent dans son `package.json`.

## Backend execute seul

Le backend peut etre lance seul, mais il n'est pas autonome au sens "copier le
dossier et executer": il depend des packages workspace, de Prisma et de la base
PostgreSQL. Depuis la racine:

```powershell
pnpm install
pnpm db:start
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev:backend
```

Pour production ou staging:

```powershell
pnpm --filter @orbi/domain build
pnpm --filter backend build
pnpm --filter backend start:prod
```

Les variables `.env` du backend doivent pointer vers une base PostgreSQL
accessible. En terrain Render/Neon, `DATABASE_URL` est fournie par Neon et les
migrations sont appliquees avant le demarrage.

## Frontieres applicatives

### Backend

Le backend possede les invariants serveur: authentification, RBAC, validation,
cycle de course, audit logs, paiements, onboarding chauffeur, support,
readiness et degradation runtime. Toute action admin qui touche operations,
confiance ou argent doit passer par un service backend et produire un audit log.

### Admin web

L'admin web est une console d'operations. Elle consomme les contrats
`packages/api`, affiche les signaux de risque et permet des decisions
auditees. Elle ne reimplemente pas la logique metier: elle presente, filtre,
priorise et appelle l'API.

### Rider app

L'app passager optimise le parcours: authentification, estimation, demande de
course, paiement, trajet actif, support et reprise apres erreur. Les erreurs
reportables utilisent la taxonomie mobile `MOB-*` et la file locale bornee.

### Driver app

L'app chauffeur couvre onboarding, profil, disponibilite, offres, trajet actif
et revenus. L'activation operationnelle reste decidee cote backend/admin apres
preuves documentaires et revue explicite.

## Flux canonique d'un changement critique

1. Definir ou confirmer l'invariant dans la doc domaine.
2. Mettre a jour le schema, service, DTO et tests backend.
3. Mettre a jour `packages/api` pour exposer le contrat stable.
4. Brancher l'app concernee avec etats loading, error, empty et degraded.
5. Ajouter ou ajuster l'audit log si le flux touche operations, argent ou
   confiance.
6. Verifier avec tests cibles, build du package concerne et `pnpm typecheck`.
7. Mettre a jour `DEVELOPMENT_STATUS.md` si la capacite change le plan actif.

## Capacites recentes a proteger

- Onboarding chauffeur securise avec documents, guidance ops, decisions et
  export CSV audite.
- Historique admin des exports onboarding lu depuis `AuditLog`.
- Mobile error reporting `MOB-*` avec ingestion backend, redaction serveur des
  secrets et tickets critiques.
- Health/readiness et launch-readiness exposes pour pilote terrain encadre.
- Idempotence et audit des flux argent deja representes dans le plan.
