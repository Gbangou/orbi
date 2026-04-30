# Mobilis World-Class Readiness Roadmap

Date de reference: 17 avril 2026

Ce document traduit l ambition produit en feuille de route technique et operationnelle realiste pour une plateforme VTC capable de supporter la production, la croissance et les mises a jour sans interruption brutale.

## Verifications du repo actuel

Le repo contient deja des fondations saines:

- backend NestJS + Prisma modulaire
- abstraction runtime avec etats `starting`, `ready`, `draining`, `stopped`
- endpoints de sante `live` et `ready`
- abstraction `realtime` avec snapshot de degradation
- abstraction `rate-limit` avec mode strict possible
- pricing localise Burkina
- admin live ops et queue support
- onboarding chauffeur structure

Le repo n est pas encore au niveau d une plateforme VTC massive, mais il est suffisamment bien structure pour y aller sans refonte totale.

## Audit rapide: ce qui est bon, ce qui doit changer

### Ce qui est deja solide

- Le backend est decoupe par domaines utiles plutot que par chaos technique.
- Le runbook de deploiement prend deja en compte readiness, draining et expand-contract.
- Le moteur pricing assume des arbitrages locaux et defendables.
- L onboarding chauffeur commence a traiter la confiance comme un flux produit a part entiere.

### Ce qui est encore riske

- Le realtime est encore base sur un transport non partage.
- Le rate limit partage n est pas encore branche pour du multi-instance reel.
- Les justificatifs chauffeur ne sont pas encore stockes et geres comme des actifs securises.
- Le workflow ops d approbation chauffeur n existe pas encore sous forme explicite.
- Les flux argent exigent encore plus d idempotence, de reconciliation et de resilience.
- La future montee en charge n est pas encore encadree par des SLO, budgets d erreur, queues et backpressure.

## Decoupage des priorites

### Priorite 0. Corriger les risques de confiance immediats

- empecher qu un vehicule soit reattribue silencieusement entre chauffeurs
- exiger une verification telephone reelle pour afficher "numero verifie"
- journaliser toutes les soumissions sensibles avec versionning des decisions ops
- refuser toute activation chauffeur sans decision ops explicite

### Priorite 1. Finaliser l onboarding chauffeur securise

- stockage objet securise pour permis, piece d identite, carte grise, assurance et selfie
- URLs signees courtes durees pour upload et consultation
- table de documents chauffeur avec type, statut, dates d expiration, hash et metadata
- workflow ops:
  - `SUBMITTED`
  - `UNDER_REVIEW`
  - `APPROVED`
  - `REJECTED`
  - `CHANGES_REQUESTED`
- notes internes ops et historique de decision
- re-verification documentaire periodique

### Priorite 2. Rendre le temps reel vraiment production-grade

- remplacer le transport local par Redis pub/sub ou broker equivalent
- propager les memes evenements vers admin, rider et driver
- definir une taxonomie d evenements stable
- supporter replay court, resume et resume after disconnect
- prevoir throttling, heartbeat, idempotence et deduplication

### Priorite 3. Securiser les flux argent

- idempotency keys sur creation paiement, capture, remboursement, webhook
- journal financier append-only pour toutes les transitions d argent
- reconciliation asynchrone entre provider, wallet et etat de course
- retries avec backoff et dead-letter queue
- separation claire entre etat metier et etat provider

### Priorite 4. Passer a une architecture de charge serieuse

- read replicas si necessaire pour analytics et consoles ops
- Redis partage pour cache, locks courts, quotas et presence
- queues de jobs pour notifications, documents, antifraude, webhooks et recalculs
- indexation et pagination strictes sur tous les endpoints volumineux
- partitionnement progressif des evenements et journaux si la volumetrie l exige

### Priorite 5. Deploiements sans interruption et sans risque business

- rolling deploys uniquement derriere `health/ready`
- migrations `expand -> migrate traffic -> contract`
- canary releases pour modules sensibles comme pricing et payments
- feature flags pour activer progressivement les nouveautes
- rollback proceduralise en moins de quelques minutes

## Blueprint cible par domaine

### Rider

- prix clair et stable avant confirmation
- ETA et disponibilite live
- suivi ride share
- support incident ultra rapide
- historique, recu, reclamation et remboursement traçables

### Driver

- onboarding decisionnable et revocable
- mode online/offline robuste
- offres et statut course en temps reel
- earnings explicables
- fatigue, fraude et risques monitorables

### Ops/Admin

- revue chauffeur et documents
- supervision courses actives et incidents
- support queue avec SLA, priorites et notes internes
- panneau pricing et experimentation
- observabilite service et drilldown par ville/quartier

## Pricing Burkina Faso: ligne directrice pragmatique

### Objectif economique

- le rider doit pouvoir utiliser la plateforme regulierement
- le chauffeur doit voir un revenu net defendable
- l operateur doit financer support, securite, paiements et croissance

### Regles a conserver

- moto comme option la plus accessible
- caps de surge stricts
- minimum fare protegeant la disponibilite chauffeur
- ajustements villes et quartiers explicables
- soutien d accessibilite sur certaines zones peripheriques sensibles

### Ce qu il faut ajouter ensuite

- calibration par donnees reelles de conversion, acceptation et annulation
- elasticite prix par ville et plage horaire
- segmentation aeroport, marche dense, interurbain, universite
- fairness engine qui arbitre entre accessibilite rider, net chauffeur et marge ops

## UX et produit: comment depasser les leaders

- faire apparaitre la securite dans le flux, pas dans les parametres
- rendre le prix explicable au moment du choix
- utiliser une langue simple, locale et rassurante
- garder les interfaces rider, driver et admin coherentes mais specialisees
- concevoir le temps reel comme une promesse de confiance, pas juste une animation

## SLO proposes pour la vraie production

- auth et endpoints critiques: disponibilite cible >= 99.9%
- creation demande de course: p95 < 400 ms hors appels externes
- diffusion evenement temps reel critique: p95 < 2 secondes
- webhook paiement traite ou mis en file de reprise: 100% des cas traces
- zero double debit tolere
- zero activation chauffeur sans revue explicite

## Prochaines etapes recommandees dans ce repo

1. Ajouter le modele de document chauffeur et le workflow ops de revue.
2. Brancher `realtime` et `rate-limit` sur un backend partage.
3. Introduire idempotency keys et journal financier plus strict.
4. Ajouter feature flags et canary strategy pour pricing, payments et onboarding.
5. Instrumenter SLO, alertes et dashboards de capacite.

## Conclusion

Mobilis n a pas besoin de copier aveuglement Uber, Bolt, Lyft ou Yango. Le bon objectif est plus exigeant: prendre leurs fondamentaux les plus solides, eliminer leurs zones d opacite, et construire une execution locale Burkina Faso exceptionnellement claire, sure et operable. Le repo actuel est une bonne base. La prochaine valeur maximale vient maintenant des workflows de confiance, du realtime partage, de la resilience argent et de la discipline zero-downtime.
