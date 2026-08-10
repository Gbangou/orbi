# Orbi - Plan observabilite

Date: 2026-08-10

## Objectif

Permettre aux operations de savoir rapidement si Orbi est sain, degrade ou dangereux pour les utilisateurs et l'argent.

## Signaux existants

- `/api/v1/health`: snapshot detaille.
- `/api/v1/health/live`: processus vivant.
- `/api/v1/health/ready`: instance prete a recevoir du trafic.
- Admin launch readiness et health incidents.
- Mobile error collector configurable.
- Rate limiting avec adaptateur in-memory, postgres ou redis.
- Realtime snapshot avec etat backplane.
- Payment webhook journal et reconciliation.

## Logs

Etat cible:

- JSON structure en production;
- champs obligatoires: `timestamp`, `level`, `service`, `environment`, `correlationId`, `actorRole`, `route`, `event`, `outcome`;
- aucun token, OTP, pickup code, signature webhook, payload complet de paiement ou document prive;
- retention staging 7 jours, production 30 jours minimum.

Dette actuelle:

- le backend utilise encore des logs Nest/console a plusieurs endroits. Le gate source interdit les logs bruts evidents, mais un logger structure complet reste a finaliser.

## Correlation IDs

Chaque requete externe doit porter ou recevoir:

- `X-Correlation-Id`;
- propagation vers logs, audit logs, payment webhook events et jobs;
- affichage admin pour investigation.

Si l'en-tete est absent, le backend doit generer un ID opaque.

## Metriques minimales

| Famille | Metriques |
| --- | --- |
| API | latence p50/p95/p99, taux 2xx/4xx/5xx, timeouts, body rejected. |
| DB | connexions, latence ping, erreurs Prisma, migrations appliquees. |
| Auth | OTP envoyes, echecs OTP, rate limit, refresh reuse, sessions revoquees. |
| Dispatch | demandes ouvertes, offres envoyees, acceptations, expirations, annulations, temps attribution. |
| Trips | actifs, demarres, termines, incidents, codes invalides, transitions refusees. |
| Paiements | intents crees, pending, confirmed, failed, webhooks rejetes, replays, refunds. |
| Wallet | credits, debits, idempotency conflicts, soldes negatifs refuses. |
| Realtime | connexions, reconnects, events published, events dropped, backplane degrade. |
| Mobile | crashes, erreurs reseau, erreurs carte, app version, device class si disponible. |
| Queue | jobs pending, failed, retrying, age du plus vieux job. |

## Alertes P0/P1

| Alerte | Seuil initial |
| --- | --- |
| Readiness down | `/health/ready` KO 2 minutes. |
| DB indisponible | ping DB KO ou pool sature 1 minute. |
| Paiements bloques | paiement pending > SLA ou webhook reject spike. |
| Wallet divergence | ledger/posting inconsistant, solde negatif refuse. |
| Queue bloquee | plus vieux job > 10 minutes ou failed spike. |
| Realtime degrade | backplane strict indisponible. |
| OTP brute force | taux echecs par numero/IP/appareil au-dessus seuil. |
| Admin compromis suspect | login admin inhabituel, changement role, action sensible hors fenetre. |
| Mobile crash spike | crash recurrent sur version publiee. |

## Dashboards

Minimum staging:

- health global;
- dispatch live;
- payment/webhook;
- wallet ledger;
- mobile errors;
- job queue.

Minimum production:

- tout staging;
- SLO API;
- conversion demande -> course;
- argent: payment attempts, refunds, wallet postings;
- audit admin;
- incidents par severite.

## Crash reporting

Le repo expose `MOBILE_ERROR_COLLECTOR_PROVIDER` et `MOBILE_ERROR_COLLECTOR_WEBHOOK_URL`. Avant production:

1. choisir un collecteur externe;
2. filtrer PII/secrets cote mobile;
3. envoyer `correlationId`, app, version, role, surface;
4. relier alertes admin health.

## Readiness operationnelle

Production ne doit pas ouvrir si:

- pas de backup restore drill;
- pas de collecte d'erreurs externe;
- pas de secrets rotables;
- pas de webhook payment signe;
- pas de monitoring readiness/liveness;
- pas de procedure compte admin compromis.
