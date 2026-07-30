# Orbi Business Model Operating System

Date de reference: 30 juillet 2026.

## Lecture simple

Orbi semble vendre une course moto ou voiture. En realite, Orbi vend un acces
fiable a une mobilite organisee: un passager peut trouver un chauffeur, connaitre
le prix, suivre le trajet, payer proprement et avoir un recours si quelque chose
se passe mal.

La course est le produit visible. Le vrai actif est le systeme qui coordonne
passagers, chauffeurs, zones, paiements, confiance, support et donnees terrain.

## Equivalent du foncier McDonald's

McDonald's utilise le burger pour attirer la demande, mais la valeur durable
vient aussi des emplacements, franchises, loyers, royalties et processus.

Pour Orbi, l'equivalent strategique est:

- le reseau de chauffeurs verifies et actifs;
- la densite de demande par zone;
- les habitudes passagers sur trajets recurrents;
- la confiance: verification, prix, suivi, incident, support;
- les relations de paiement et de reversement;
- les donnees locales sur quartiers, heures, prix acceptes et disponibilite.

Le code est l'interface. Le moat est le reseau opere correctement.

## Equation economique

Pour une course de 3 000 XOF avec 15% de commission:

```text
Prix passager:          3 000 XOF
Commission Orbi:          450 XOF
Payout chauffeur:       2 550 XOF
```

La commission n'est pas encore le profit. Il faut retirer les couts variables:
paiement, notifications, cartes, support, fraude, remboursements, promotions et
operations terrain. La contribution par course devient donc:

```text
Contribution = commission - couts variables directs
```

Pendant le pilote, Orbi doit optimiser trois valeurs ensemble:

```text
Valeur passager <-> Valeur chauffeur <-> Contribution Orbi
```

Un prix bas qui appauvrit le chauffeur n'est pas durable. Un prix eleve qui tue
la repetition passager n'est pas durable non plus.

## Metriques de verite

Les metriques importantes ne sont pas les telechargements. Ce sont:

- liquidite: demandes assignees, temps de pickup, courses completees;
- confiance: paiements reussis, tickets pour 100 courses, incidents ouverts;
- valeur chauffeur: courses completees par chauffeur actif, payout net;
- repetition: riders qui refont au moins une course dans les 30 jours;
- contribution: commission estimee moins couts variables directs;
- discipline zone: volume concentre dans des corridors exploitables.

Le nouveau cockpit admin `Modele economique reel` expose ces signaux pour eviter
de piloter Orbi comme une simple application de reservation.

## Centre de commande pilote

Le cockpit admin expose aussi un centre de commande pilote. Son role est de
prendre les signaux business, operations, finance, support et mobile pour
produire une decision:

- `GO pilote controle`: continuer en zone limitee avec supervision;
- `Pilote limite`: continuer les tests, sans ouvrir largement le trafic;
- `NO GO extension`: bloquer l'expansion tant que les gates critiques restent
  mauvais.

Les gates suivis sont:

- liquidite course;
- execution course;
- argent et paiement;
- stabilite mobile;
- support terrain;
- valeur chauffeur.

Cette decision ne remplace pas le jugement terrain. Elle force surtout Orbi a ne
pas confondre volume, telechargements ou jolies interfaces avec un systeme de
mobilite fiable et rentable.

## Regle produit

Chaque nouvelle fonctionnalite doit renforcer au moins un de ces piliers:

1. augmenter la liquidite marketplace;
2. reduire le risque et l'incertitude;
3. ameliorer la valeur chauffeur;
4. augmenter la repetition passager;
5. rendre la contribution par course plus lisible ou meilleure.

Une fonctionnalite qui ne renforce aucun pilier doit attendre.

## Regle dispatch

Le dispatch ne doit pas seulement choisir le chauffeur le plus proche. Il doit
prioriser une affectation qui maximise la probabilite que la course arrive au
bout tout en restant saine pour le chauffeur et la marketplace.

Le score de priorite business d'une offre combine:

- score dispatch operationnel;
- confiance de l'offre;
- comportement recent du chauffeur;
- fairness economique rider/chauffeur/ops;
- efficacite pickup par rapport a la distance de course.

Cela evite deux erreurs dangereuses:

- envoyer trop souvent des chauffeurs loin du pickup pour des gains faibles;
- maximiser le prix apparent sans proteger la repetition passager.

## Definition courte

Orbi est un systeme d'exploitation local de mobilite qui transforme une offre de
transport fragmentee en services fiables, tracables et monetisables.
