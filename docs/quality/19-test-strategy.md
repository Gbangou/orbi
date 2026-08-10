# Orbi - Strategie de tests orientee risques

Date: 2026-08-10  
Objectif: evaluer la couverture qui protege les invariants metier et securite, pas le pourcentage de lignes.

## Lecture rapide

Le backend possede une base de tests solide sur les flux critiques: pricing, ride requests, dispatch, trips, paiements, portefeuille, auth, autorisation, admin, realtime et resilience. Les apps mobiles ont surtout des tests de smoke, navigation, feedback, stockage de session, cartes et signaux operationnels.

Statut honnete: pret pour developpement local et tests internes; pas encore suffisant seul pour beta/pilote sans E2E bout-en-bout automatises sur environnement proche terrain.

## Couverture par risque

| Risque | Couverture actuelle observee | Niveau | Gaps principaux | Tests a maintenir/ajouter |
| --- | --- | --- | --- | --- |
| Tarification | `pricing.service.spec.ts`, presets domaine, contrats API | Forte cote backend | Pas assez de tests frontend sur explication prix/FCFA selon tous les etats | Tests UI devis expire, prix modifie, option indisponible |
| Devis | Pricing + ride request policy + booking safety mobile | Moyenne | Expiration/refus devis obsolete a couvrir de bout en bout | Integration Rider -> backend devis -> confirmation |
| Etats course | `trips.service.spec.ts`, `trip-acceptance.policy.spec.ts`, utils/presenter | Forte backend | E2E Rider/Driver avec reprise app/reseau encore partiel | E2E trajet complet et evenements hors ordre |
| Code de prise en charge | Specs trips/security/presenter existantes | Forte backend | Audit E2E mobile saisie code cote Driver a renforcer | E2E mauvais code, code expire, autre chauffeur |
| Autorisation | Guards, admin security, riders/trips/payments security specs | Forte backend | Matrice IDOR complete a garder synchronisee avec nouvelles routes | Tests IDOR par ressource et role |
| Annulation | Ride requests/trips couvrent une partie | Moyenne | Frais, fenetres d'annulation et remboursement associe a systematiser | Integration annulation Rider/Driver/Admin |
| Commissions | `driver-commission.spec.ts`, payouts/admin wallets | Moyenne a forte | Couverture E2E revenu chauffeur apres course limitee | Tests montant brut/commission/net/disponible |
| Paiements | `payments.service.spec.ts`, `payments.security.spec.ts`, E2E paiement | Forte backend | Vraies captures sandbox provider encore a completer | Webhooks signatures, replays, hors ordre, crash windows |
| Remboursement | Payments specs + fixtures refund | Moyenne | Parcours admin refund et compensation a tester en integration plus large | Refund duplicate, partial failure, audit |
| Portefeuille | `wallet-topup.service.spec.ts`, payouts, ledger docs/tests | Forte backend | E2E Rider/Driver wallet depuis actions utilisateur | Tests ledger concurrentiels multi-operation |
| Idempotence | Paiements, portefeuille, demande/acceptation selon specs | Forte sur argent; moyenne dispatch | Idempotence double demande Rider et double acceptation chauffeur a executer en integration DB | Tests transactionnels et concurrence reelle |
| Upload documents | Document links/scanner/admin onboarding specs | Moyenne | Tests malformations fichier reels et stockage provider signes | Integration upload MIME falsifie, acces horizontal |
| Temps reel | Realtime security/service/transport specs, mobile signal tests | Moyenne | Handshake token cryptographique encore a finaliser | E2E reconnect + reconcile serveur |

## Tests unitaires requis

| Domaine | Tests actuels | Evaluation |
| --- | --- | --- |
| Tarification/devis | `apps/backend/src/modules/pricing/pricing.service.spec.ts` | Bon socle; ajouter davantage de cas limite sur expiration et indisponibilite service. |
| Etats/annulation | `ride-request-creation.policy.spec.ts`, `trip-acceptance.policy.spec.ts`, `trips.utils.spec.ts` | Bon socle; completer par annulation avec frais et remboursement. |
| Code prise en charge | `trips.security.spec.ts`, `trips.service.spec.ts`, `trips.presenter.spec.ts` | Bon; garder test explicite "driver ne recoit jamais le code". |
| Autorisation | `roles.guard.spec.ts`, `profile-access.guard.spec.ts`, specs `*.security.spec.ts` | Bon; chaque nouvelle route doit ajouter un test de propriete ressource. |
| Commissions | `driver-commission.spec.ts`, payouts specs | Correct; ajouter integration revenu chauffeur post-course. |
| Paiements/remboursements | `payments.service.spec.ts`, `payments.security.spec.ts`, `payments.e2e.spec.ts` | Fort; depend encore de fixtures provider. |
| Portefeuille/idempotence | `wallet-topup.service.spec.ts`, admin payouts specs | Fort cote ledger; verifier multi-operation concurrente regulierement. |

## Tests d'integration requis

| Flux | Statut actuel | Priorite |
| --- | --- | --- |
| Rider -> backend | Partiel via backend E2E riders/trips/payments et smoke mobile | P1: automatiser creation demande complete depuis client API partage. |
| Driver -> backend | Partiel via drivers/trips specs et smoke Driver | P1: integration acceptation/offre/presence avec etat serveur. |
| Attribution/concurrence | Couvert par policies et services; concurrence DB a surveiller | P0 pour pilote. |
| Paiement/webhook | Bien couvert backend | P0, maintenir comme gate obligatoire. |
| Portefeuille | Bien couvert services; E2E utilisateur a ajouter | P1. |
| Upload | Services document links/scanner couverts | P1: integration stockage prive + URL signee + IDOR. |
| Administration | Large couverture admin controller/service/web | P1: actions sensibles avec audit complet obligatoire. |
| Acces horizontal | Plusieurs specs security | P0: matrice exhaustive par ressource a garder obligatoire. |

## Scenarios E2E principaux a creer

| ID | Scenario | Resultat attendu |
| --- | --- | --- |
| E2E-R01 | Rider authentifie, localisation autorisee, destination, devis, confirmation | Une seule demande active, devis serveur valide, paiement choisi, recherche chauffeur. |
| E2E-R02 | Aucun chauffeur disponible | Message fonctionnel, annulation/retour possible, aucune course fantome. |
| E2E-R03 | Chauffeur trouve, code affiche Rider uniquement | API Driver/socket ne contient jamais le code attendu. |
| E2E-R04 | Trajet demarre apres code valide serveur | Etat serveur passe a `IN_PROGRESS`, Rider/Driver se synchronisent. |
| E2E-R05 | Perte reseau puis reprise | Re-auth, reconciliation serveur, aucun double paiement/demande. |
| E2E-D01 | Driver onboarding documents -> attente -> approbation admin | Impossible de passer en ligne avant approbation, audit admin present. |
| E2E-D02 | Driver passe en ligne avec documents valides | Backend valide eligibilite et presence. |
| E2E-D03 | Offre recue puis acceptation concurrente | Un seul chauffeur gagne, autres recoivent un message metier clair. |
| E2E-D04 | Mauvais code, code expire, double start | Refus serveur, tentatives limitees, aucun code revele. |
| E2E-D05 | Fin de course et revenus | Montants backend: brut, commission, net, disponible/en attente. |

## Definition de "suffisamment couvert"

Un risque est couvert seulement si:

- le test prouve l'invariant metier ou securite;
- il echoue sur une regression plausible;
- il verifie l'autorite serveur quand l'action est sensible;
- il inclut au moins un cas negatif;
- il n'utilise pas uniquement des donnees fictives sans contrat clair;
- il est appele par une gate CI bloquante ou documente comme manuel avant pilote.

## Validations executees pendant cette passe

- `pnpm --filter backend test -- pricing.service.spec.ts ride-request-creation.policy.spec.ts trip-acceptance.policy.spec.ts payments.service.spec.ts wallet-topup.service.spec.ts --runInBand` - OK, 137 tests.
- `pnpm quality:source` - OK.
- `pnpm typecheck` - OK.
- `pnpm --filter backend exec prisma validate` - OK.
- `pnpm build:admin` - OK hors sandbox.
- `pnpm build:rider:ci` - OK hors sandbox.
- `pnpm build:driver:ci` - OK hors sandbox.

Blocage volontairement non corrige dans cette passe:

- `pnpm lint:check` echoue actuellement sur 1803 problemes backend, majoritairement Prettier et quelques regles TypeScript unsafe. La gate est maintenant reelle; elle doit rester rouge jusqu'a correction controlee de la dette lint.
