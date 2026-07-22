# Orbi Competitive Benchmark

Date de reference: 17 avril 2026

Ce document compare Orbi a des plateformes VTC reputees afin de guider les priorites produit, securite, pricing, operations et architecture. Les constats ci-dessous s appuient sur des pages officielles publiques de produit, de pricing et de safety.

## Sources officielles de reference

- Uber upfront pricing: https://www.uber.com/us/en/ride/how-it-works/upfront-pricing/
- Uber marketplace pricing: https://www.uber.com/us/en/marketplace/pricing/upfront-pricing/
- Uber safety commitment: https://www.uber.com/us/en/safety/our-commitment/
- Uber rider safety: https://www.uber.com/gb/en/ride/safety/
- Lyft safety: https://www.lyft.com/safety
- Lyft rider pricing help: https://help.lyft.com/hc/en-us/all/articles/115012925707-The-rider-
- Lyft driver upfront pay: https://help.lyft.com/hc/en/all/articles/8668928544/
- Bolt rider safety: https://bolt.eu/en/rider/safety/
- Bolt rides safety: https://bolt.eu/en/rides/safety/
- Yango rider safety: https://yango.com/en_np/rider/safety
- Yango safety overview LATAM: https://yango.com/en_int/lp/safety/latam/rider
- Yango support overview: https://yango.com/support/taxi-all-app-yango/about.html
- Yango tariff example: https://yango.com/en_int/thies/tariff/econom
- LibreTaxi open-source Telegram rideshare PoC: https://github.com/ro31337/libretaxi
- JavaScript Mastery Uber clone: https://github.com/adrianhajdin/uber
- Amit Shekhar Uber/Lyft Android learning app: https://github.com/amitshekhariitbhu/ridesharing-uber-lyft-app

## Lecture executive

Les leaders mondiaux convergent sur six standards minimums:

- prix connu avant confirmation
- safety center visible et actionnable
- verification chauffeur et vehicule
- partage de trajet et assistance urgence
- support 24/7 ou quasi equivalent
- operations temps reel pour incidents et courses actives

Orbi peut devenir meilleur que beaucoup d acteurs etablis si le produit execute mieux sur trois combinaisons rarement tres bien reunies ensemble:

- clarte economique tres forte
- securite active vraiment visible au bon moment
- excellence locale Burkina Faso sur pricing, paiements et langage produit

## Ce que chaque concurrent fait bien

### Uber

- Pricing upfront mature avec explication du caractere pre-estime et des cas de recalcul.
- Safety tres riche: trusted contacts, emergency assistance, trip monitoring, verification et outils de support.
- Grande discipline de plateforme sur la confiance, la prevention et les flux critiques.

### Lyft

- Bonne clarte sur le prix cote rider et la logique de gains visibles cote driver.
- Safety simple a comprendre et assez bien integrée au parcours.
- Experience generalement rassurante sur les fondamentaux plutot que spectaculaire.

### Bolt

- Safety pedagogique et concrete: pickup codes, phone masking, ride check, trusted contacts, support.
- UX de reassurance souvent plus accessible et lisible que celle de concurrents plus lourds.
- Bonne execution sur des marches sensibles au prix.

### Yango

- Positionnement fort sur le prix visible a l avance et sur l adaptation locale.
- Safety center oriente partage, SOS, verification et suivi.
- Communication plus explicite dans certains marches sur la composition de tarif et les frais.

### Open-source Uber/Lyft clones utiles

- LibreTaxi rappelle qu un flux rideshare minimal peut fonctionner par chat,
  avec PostgreSQL, RabbitMQ, moderation admin et une surface tres simple. La
  lecon utile pour Orbi est la resilience operationnelle, pas la copie UI.
- Le clone JavaScript Mastery montre les attentes demo modernes: Expo, maps,
  autocomplete, choix trajet, paiement Stripe, historique et UI mobile lisible.
  Il reste un produit d apprentissage, sans les couches ops, audit, KYC et
  reconciliation argent necessaires a Orbi.
- Le projet Android Uber/Lyft d Amit Shekhar met en avant les micro-etats UX:
  cabs proches, pickup/drop, trajet pickup, arrivee chauffeur, trip ongoing,
  fin de course, animation et WebSocket simule. Orbi doit garder ces etats
  visibles tout en les reliant a de vrais contrats backend, audit et safety.

## Matrice benchmark

Echelle:

- fort = reference visible du marche
- moyen = present mais pas nettement differenciant
- faible = peu visible ou peu structure publiquement

| Axe | Uber | Lyft | Bolt | Yango | Ambition Orbi |
| --- | --- | --- | --- | --- | --- |
| Prix upfront | fort | fort | moyen a fort | fort | fort avec fenetre de confiance, raisons et plafonds |
| Explicabilite du prix | moyen | moyen | moyen | moyen a fort | fort, local et tres pedagogique |
| Safety in-ride | fort | fort | fort | moyen a fort | fort avec declencheurs contextuels |
| Verification chauffeur | fort | fort | fort | moyen a fort | fort avec revue ops stricte et re-expiration docs |
| Outils support incident | fort | moyen a fort | fort | moyen | fort avec timeline et audit log unifies |
| Localisation marche africain | variable | faible | fort | fort | tres fort Burkina d abord |
| Equilibre prix / revenus chauffeur | variable | moyen | moyen a fort | moyen | fort via caps, minimums et fairness locale |
| Transparence ops en temps reel | faible cote public | faible cote public | moyen | moyen | fort cote admin, rider et driver |
| Experience admin / ops | forte en interne, peu visible publiquement | peu visible | peu visible | peu visible | fort, assumee comme avantage competitif |

## Standards gagnants a reproduire

- prix visible avant la commande
- anonymisation ou protection des coordonnees sensibles
- verification documentaire et identitaire du chauffeur
- suivi du trajet, partage et assistance urgence
- outils de support rapides en cas d incident
- surveillance des deviations ou anomalies de trajet
- traces exploitables pour l audit, la resolution et la fraude

## Faiblesses recurrentes du marche

- Le prix est upfront, mais pas toujours comprehensible.
- Les hausses de demande restent souvent vecues comme punitives.
- Les outils de securite existent mais sont parfois caches dans des menus secondaires.
- Les parcours d onboarding chauffeur sont frequemment trop lents, trop opaques ou trop manuels.
- Les experiences ops sont puissantes en interne mais peu reliees a la confiance percue par rider et driver.

## Position actuelle de Orbi dans ce repo

Points deja credibles:

- moteur pricing Burkina avec caps de demande, ajustements par ville et profil de quartier
- onboarding chauffeur structure avec checklist, statut `PENDING` et audit log
- abstractions `realtime`, `rate-limit`, `health`, `runtime lifecycle`
- runbook de deploiement prudent avec readiness, draining et expand-contract
- admin live ops, support queue et signaux incident
- partage trajet securise, SOS rider/driver, route monitoring initial et
  contact de confiance rider audite
- limites fatigue chauffeur avec blocage mise en ligne/acceptation et audit ops
- declaration volontaire de preuve incident avec consentement, retention courte
  et aucun upload automatique
- SLO runtime visibles dans l admin, posture de risque production et taxonomie
  crash/error mobile pour router auth, booking, paiement, realtime et securite
  vers les bons owners
- score `Excellence terrain` dans launch-readiness: stabilite runtime/mobile,
  securite, support, flotte chauffeur, argent et temps reel compares aux
  attentes de leaders comme Uber, Bolt et Yango
- taxonomie d erreurs mobile partagee dans `packages/api`, consommee par rider
  et driver pour classer auth, booking, paiement, realtime, securite, reseau et
  validation avec message utilisateur, owner et politique de reprise
  avec detection deviation, arret long et absence de progression
- detail de course rider avec preuve chauffeur/vehicule structuree: statut de
  verification, telephone verifie, note, courses terminees, plaque, couleur,
  marque et modele. C est un standard Uber/Lyft avant montee a bord, relie au
  suivi trajet et au support.

Ecarts encore majeurs avant niveau world-class:

- pas encore de stockage securise des justificatifs ni d URLs signees
- pas encore de decision ops explicite `approve/reject/request_changes` sur le dossier chauffeur
- realtime encore en transport local, pas sur backplane partage multi-instance
- pas encore de vrai controle d idempotence sur tous les flux argent et webhooks
- pas encore de moteur dispatch geospatial ou de matching sous contrainte a grande echelle
- SLO et taxonomie incident sont maintenant exposes; il manque encore le tracing
  distribue, les dashboards metriques long terme, l alerting externe et le
  capacity planning
- le score excellence terrain est un score de decision ops; il doit encore etre
  enrichi par metriques mobiles reelles, crash-free sessions, NPS, temps de
  premiere reponse support et conversion booking terrain
- la taxonomie mobile est maintenant partagee, les erreurs reportables sont
  mises en file locale bornee avec contexte anonymise puis drainees vers l API
  pour audit/ticket support critique; il faut encore brancher Crashlytics/Sentry
  ou equivalent, compteurs crash-free sessions et exports anonymises vers
  l admin
- route monitoring, fatigue et preuve incident encore dependants de seuils et
  workflows initiaux; il faut calibrer avec donnees terrain, chaleur, nuit,
  type vehicule et doctrine support
- preuve chauffeur/vehicule visible mais encore incomplete: il manque photo de
  profil verifiee, selfie live avant mise en ligne, masquage telephone et
  rescreening periodique documente.

## Direction produit pour etre meilleur que les concurrents

### 1. Gagner par la clarte economique

- Montrer le prix avant validation.
- Montrer pourquoi il bouge.
- Afficher une fenetre de confiance et non un chiffre sans contexte.
- Plafonner les multiplicateurs de demande.
- Expliquer la commission et le payout chauffeur de facon simple cote ops.

### 2. Gagner par la securite active

- Verification pickup sans friction dans le flux standard: arrivee chauffeur,
  preuve chauffeur/vehicule visible, depart confirme quand le passager est a
  bord, et verification renforcee seulement pour cas sensibles definis par ops.
- Trusted contacts simples avec modes manuel, nuit ou tous trajets.
- Bouton SOS visible mais sobre.
- Detection de deviation, arret anormal et absence de progression deja amorcee;
  ajouter pickup suspect, arret communication et pattern fraude.
- Revue ops chauffeur avec notes internes, decisions explicites, re-expiration et audit trail.

### 3. Gagner par la localisation Burkina Faso

- Mobile money d abord.
- UX francophone native.
- Motos et voitures traitees comme produits de premiere classe.
- Tarification differenciee par ville, quartier et realite socio-economique.
- Support et operations adaptes aux usages de Ouagadougou, Bobo-Dioulasso, Koudougou, Banfora et Ouahigouya.

### 4. Gagner par l excellence operations

- Evenements temps reel unifies pour rider, driver et admin.
- Tableaux ops qui pilotent le service en direct, pas seulement des KPI passifs.
- Auditabilite sur onboarding, paiements, support, incidents, annulations et changements de prix.
- Deploiements sans interruption avec compatibilite schema, draining et rollback simple.

## Recommandations produit immediates

- conserver le pricing upfront comme promesse non negociable
- rendre l onboarding chauffeur securise et decisionnable par les operations
- relier les incidents, tickets support, trip events et alertes live dans la meme timeline
- finir le passage vers un backplane partage pour `realtime` et `rate-limit`
- faire du Burkina pricing et des paiements locaux un avantage strategique, pas juste un parametre technique

## Conclusion

Uber, Lyft, Bolt et Yango ont deja prouve que la vitesse, le prix upfront et la safety visible sont les fondamentaux du marche. La vraie opportunite de Orbi est d assembler ces bases avec une execution plus juste, plus explicable, plus locale et plus operationnelle. Si Orbi devient la plateforme la plus lisible, la plus rassurante et la plus bien operee du Burkina Faso, elle peut sembler plus moderne et plus fiable que des acteurs plus gros mais moins adaptes localement.
