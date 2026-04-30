# Mobilis Deployment Runbook

Ce document decrit la strategie de deploiement prudente pour Mobilis lorsqu'il y a:

- des utilisateurs connectes
- des trajets en cours
- des paiements et de l'argent en circulation
- plusieurs instances backend

## Objectif

Faire des mises a jour sans interruption brutale, sans double traitement, et sans casser les flux critiques.

## Fondations deja en place

- endpoint `GET /api/v1/health/live`
- endpoint `GET /api/v1/health/ready`
- etat runtime `starting -> ready -> draining -> stopped`
- refus automatique des nouvelles requetes applicatives quand une instance n'est pas prete ou entre en drainage
- shutdown gracieux pilote par `GRACEFUL_SHUTDOWN_TIMEOUT_MS`
- pagination bornee sur plusieurs endpoints sensibles
- rate limiting et temps reel abstraits derriere des adapters configurables

## Strategie de deploiement recommandee

1. Utiliser au moins deux instances backend derriere un load balancer.
2. Configurer le load balancer pour router uniquement vers les instances dont `health/ready` retourne HTTP 200.
3. Lors d'un rolling deploy:
   - demarrer la nouvelle version
   - attendre `health/ready = ready`
   - basculer progressivement le trafic
   - envoyer `SIGTERM` a l'ancienne instance
   - laisser l'instance passer en `draining`
   - laisser le load balancer l'exclure
   - attendre la fermeture gracieuse

## Regle de migration base de donnees

Ne jamais deployer une migration destructive en meme temps qu'une version applicative encore compatible avec l'ancien schema.

Utiliser la strategie `expand -> migrate traffic -> contract`:

1. `Expand`
   - ajouter colonnes/tables/index sans supprimer l'ancien schema
   - rendre la nouvelle version backward compatible
2. `Migrate traffic`
   - deployer le nouveau code
   - verifier readiness, logs, paiements, flux critiques
   - backfill des donnees si necessaire
3. `Contract`
   - supprimer ancien schema seulement quand toutes les instances utilisent le nouveau code

## Paiements et argent

- tout traitement webhook doit etre idempotent
- ne jamais lier une mise a jour critique de paiement a un seul process en memoire
- preferer des traitements rejouables et journalises
- en production multi-instance, brancher les adapters `rate limit` et `realtime` sur Redis ou un broker partage

## Temps reel

Aujourd'hui, le backend fournit une base SSE et un transport in-memory.

Pour la vraie production multi-instance:

1. garder la meme interface applicative
2. remplacer le transport realtime par un backend Redis pub/sub ou broker
3. connecter rider, driver et admin a des flux live partageant la meme source d'evenements

## Garde-fous de deploiement realtime

- `REALTIME_ADAPTER=in-memory` reste acceptable pour le dev local et les previews mono-instance
- `REALTIME_ADAPTER=redis` declare l intention de tourner avec un backplane partage multi-instance
- tant que le transport Redis partage n est pas branche, la sante remontera un etat realtime degrade
- activer `REALTIME_STRICT=true` en preproduction/production pour faire echouer la readiness d une instance qui demarrerait avec un fallback non partage

Cela evite un faux sentiment de securite ou une prod multi-instance tournerait par erreur en transport local non partage.

## Garde-fous de deploiement rate limit

- `RATE_LIMIT_ADAPTER=in-memory` reste acceptable pour le dev local et les previews mono-instance
- `RATE_LIMIT_ADAPTER=redis` declare l intention d utiliser un comptage partage entre instances
- tant que le store Redis partage n est pas branche, la sante remontera un etat rate limit degrade
- activer `RATE_LIMIT_STRICT=true` en preproduction/production pour faire echouer la readiness d une instance qui demarrerait avec un fallback non partage

Cela evite qu un cluster multi-instance expose des limites incoherentes selon les noeuds, ce qui degrade la securite et la stabilite sous charge.

## Checklist avant de deployer

- `pnpm typecheck`
- `pnpm --filter backend test -- --runInBand`
- verifier que `DATABASE_URL` authentifie reellement contre PostgreSQL avant toute migration Prisma
- migrations relues en mode `expand-contract`
- rollback plan prepare
- secrets/env verifies
- monitoring, logs et alertes actifs

## Checklist apres deploiement

- `health/live` et `health/ready` verts
- verification creation de session
- verification demande de course
- verification acceptation chauffeur
- verification paiement initialise
- verification ticket support et flux live
