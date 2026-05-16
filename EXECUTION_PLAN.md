# Orbi Execution Plan

Orbi vise une plateforme de mobilite complete, premium et francaise d'abord pour le Burkina Faso, avec rider app, driver app, admin web et backend robuste.

## Ambition produit

- Une experience unifiee pour moto et voiture
- Android, iOS et web pour les experiences passager et chauffeur
- Admin operations solide pour le pilotage quotidien
- Voix et comprehension d'intention comme avantage produit reel
- Architecture prete pour temps reel, paiements, wallet, support, incidents et expansion regionale

## Ce qui existe deja

- Monorepo `pnpm` structure avec `apps/*` et `packages/*`
- Backend NestJS + Prisma avec schema de base credible
- Apps Expo rider et driver avec ecrans de fondation
- Admin Next.js avec shell dashboard
- Packages partages pour design, domaine et donnees de demo

## Etat cible

### Phase 1. Foundations product-grade

- Standardiser domaine, theme, config runtime et client API partage
- Stabiliser le backend de base, la configuration et les conventions d'environnement
- Corriger les incoherences de copy, d'encodage et de structure
- Poser les standards de qualite, de securite et de livraison

### Phase 2. Real auth and identities

- Creation de compte, connexion et sessions securisees
- Hash de mot de passe, JWT, roles, guards, autorisation
- Profiles rider/driver/admin relies a la base
- Preparation onboarding chauffeur et verification

### Phase 3. Real client-backend integration

- Brancher admin web sur l'API
- Brancher rider app sur pricing, booking, activity, profile
- Brancher driver app sur overview, offers, vehicle/profile, earnings
- Introduire etats de chargement, erreurs, vide et transitions propres

### Phase 4. Dispatch and trip lifecycle

- Demande de course reelle
- Matching initial et affectation chauffeur
- Statuts course de bout en bout
- Journal d'evenements et base temps reel

### Phase 5. Voice intelligence

- Capture vocale mobile/web
- Envoi d'intentions vocales vers le backend
- Normalisation lieu, suggestions, correction ambiguite
- UX vocale premium, rapide et locale

### Phase 6. Realtime and operations

- WebSocket / Socket.IO ou abstraction equivalente
- Position chauffeur, diffusion statuts, tableau operations vivant
- Signalement incident, monitoring live, support en cours de trajet

### Phase 7. Payments, wallet, trust and safety

- Wallet, transactions, journalisation financiere
- Foundations paiements et remboursements
- Notes, support, moderation, audit log
- Renforcement securite, observabilite et resilience
- Workflow explicite de revue chauffeur et gestion documentaire securisee
- Idempotence stricte sur les flux argent, webhooks et remboursements

### Phase 7.5. Multi-instance and zero-downtime hardening

- Backplane partage pour realtime et rate limiting
- Feature flags et canary releases pour modules critiques
- Queues de jobs pour webhooks, notifications, antifraude et documents
- File durable PostgreSQL avec deduplication, retry borne et dead-letter pour
  webhooks paiement, documents chauffeur et notifications
- Producteurs backend branches sur la file durable pour webhooks paiement,
  verification objet document chauffeur et notifications persistantes
- SLO runtime exposes dans `/health`, dashboard admin risque production,
  taxonomie crash/error mobile et alerting actionnable
- Score excellence terrain dans launch-readiness pour comparer runtime/mobile,
  securite, support, flotte chauffeur, argent et realtime aux standards leaders
- Taxonomie d erreurs mobile partagee `MOB-*` utilisee par rider et driver pour
  messages, reprise, ownership et futur crash reporting
- File locale rider/driver pour erreurs mobile reportables, bornee et
  anonymisee, afin de preparer l ingestion Sentry/Crashlytics/admin sans
  bloquer les parcours utilisateur
- Endpoint `/mobile/error-reports` authentifie rider/driver: ingestion bornee,
  audit idempotent par rapport et ticket support automatique pour signaux
  critiques
- Tracing et capacity planning branches sur les memes objectifs de service
- Discipline `expand -> migrate traffic -> contract`
- Gouvernance documentaire: carte du repo, index docs et statut courant doivent
  rester alignes avec chaque changement critique pour eviter une architecture
  implicite ou contradictoire.

### Phase 8. Hardening and launch readiness

- Tests critiques
- QA multi-plateforme
- CI/CD
- Monitoring, logs, backups, runbooks
- Performance, accessibilite et polishing final

## Methodologie de travail

1. Construire par phases verticales et livrables, pas par chaos de fichiers.
2. Garder une architecture partagee claire entre mobile, web et backend.
3. Faire passer la securite et la fiabilite avant les effets visuels.
4. Ajouter l'innovation produit la ou elle cree un vrai avantage, notamment la voix et les parcours intelligents.
5. Verifier en continu par build, typecheck, tests et validations locales.

## Standards non negociables

- Validation stricte des donnees et DTOs
- Contrats API explicites
- Separation claire domaine / presentation / transport / persistance
- Variables d'environnement documentees
- Securite par defaut
- UX francophone simple, fluide et locale
- Aucun flux critique argent ou confiance ne depend d un seul process en memoire

## Estimation de delai

Ces delais supposent un travail continu de bout en bout dans ce repo, avec iterations design + produit + backend + integration:

- MVP solide, coherent et demo-serieuse: 6 a 10 semaines
- Version beta tres credible avec auth reelle, cycle course, voix, admin utile et qualite elevee: 3 a 5 mois
- Version production complete, robuste, securisee et exploitable a echelle locale serieuse: 6 a 9 mois

## Risques a gerer des maintenant

- Ne pas laisser les apps vivre trop longtemps sur des mocks
- Ne pas construire la voix comme gadget; elle doit etre liee a de vrais flux
- Ne pas retarder auth, roles et auditabilite
- Ne pas surcharger le design avant d'avoir un socle produit fiable

## Definition of done pour chaque phase

- Le code compile
- Les variables d'environnement sont documentees
- Les flux principaux sont testables
- Les ecrans ont etats loading/error/empty
- La base de donnees et l'API supportent reellement le parcours
- Les docs source de verite (`DEVELOPMENT_STATUS.md`, doc domaine, runbook si
  applicable) refletent le comportement livre
- La phase suivante peut s'appuyer dessus sans refonte brutale
