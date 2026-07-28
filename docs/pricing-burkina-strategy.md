# Burkina Pricing Strategy

Date de reference: 26 juillet 2026

## Objectif

Construire un pricing pragmatique, local et soutenable pour le Burkina Faso afin que:

- le client garde confiance et puisse utiliser le service regulierement,
- le chauffeur conserve un revenu attractif,
- l operateur protege sa marge et la qualite de service,
- le systeme reste lisible, defendable et configurable.

## Hypotheses de travail

Ces hypotheses sont des choix produit/operations en attendant une boucle d apprentissage plus fine par donnees reelles:

- Ouagadougou est le marche principal et le plus dense.
- Bobo-Dioulasso est le second marche urbain majeur.
- Koudougou, Banfora et Ouahigouya demandent un positionnement plus sensible au pouvoir d achat et a la profondeur de flotte.
- Les motos doivent rester le mode d acces le plus abordable.
- Les zones residentielles peripheriques et semi-urbaines ont besoin de protections d accessibilite.

## Logique implantee

Le moteur pricing applique maintenant:

- un socle par type de vehicule et zone,
- un calcul par distance et duree du trajet demande entre pickup client et destination,
- un multiplicateur de demande plafonne,
- un ajustement local par ville,
- un ajustement par profil de quartier,
- un ajustement trafic, meteo, etat de route et disponibilite flotte,
- un soutien d accessibilite sur certaines courses moto peri-urbaines,
- un arrondi CFA commercial vers le haut, priorisant les paliers de 100 XOF
  quand l ecart reste raisonnable et les paliers de 50 XOF sinon,
- une fenetre de prix et des raisons explicables.

La distance d approche chauffeur vers le client est volontairement traitee comme
un signal de dispatch, d ETA et de qualite d affectation. Elle ne devient pas une
ligne de prix cachee pour le passager dans le devis upfront. Cette separation
evite de penaliser le client parce que le systeme a choisi un chauffeur plus loin,
tout en permettant au dispatch de prioriser les chauffeurs proches et rentables.
Si Orbi decide plus tard de subventionner ou compenser explicitement certaines
approches longues, cela devra etre expose comme une regle ops ou une promotion
auditable, pas comme une hausse silencieuse du prix passager.

La console admin expose aussi une calibration terrain sur les 14 derniers jours:

- demandes creees, demandes matchees, courses completees et demandes payees,
- taux d acceptation, completion, annulation/expiration et conversion paiement,
- prix moyen, payout chauffeur estime, prix moyen au kilometre et attente pickup,
- lecture par segment vehicule/tier pour reperer les categories a recalibrer,
- lecture par fenetre horaire operationnelle: pic matin, journee, pic soir et nuit,
- lecture par ville et profil de quartier persistes sur les nouvelles demandes,
- recommandations ops priorisees avant tout ajustement automatique,
- alertes ops de fairness sur accessibilite, annulation, paiement et acceptation.

Les apps clientes peuvent envoyer explicitement `city` et `districtProfile` au moment de la reservation. Les presets Burkina utilises par le rider, la console admin et le backend vivent maintenant dans `packages/domain`, via `burkinaPricingCityPresets` et `resolveBurkinaPricingPresetForPlace`, pour eviter la derive entre simulation, reservation et calibration. Pour garder la compatibilite avec les anciens clients, le backend complete aussi la geographie depuis ce resolver partage puis, en dernier recours, depuis les adresses et le type de zone lorsque ces champs ne sont pas fournis.

## Villes couvertes dans le moteur

- Ouagadougou
- Bobo-Dioulasso
- Koudougou
- Banfora
- Ouahigouya

## Profils de quartier couverts

- centre-ville
- universite
- administratif
- aeroport
- residentiel standard
- residentiel peripherique
- zone marche dense
- zone industrielle
- porte interurbaine

## Philosophie economique

### Client

- Eviter les hausses brusques et mal comprises.
- Garder la moto comme solution d entree abordable.
- Donner un prix visible, une fenetre de confiance et une explication simple.

### Chauffeur

- Proteger les trajets peu rentables via un minimum fare.
- Garder des ajustements positifs dans les zones a contrainte operationnelle.
- Garder la commission lisible et stable.
- Pendant le pilote terrain, appliquer 10% de commission aux chauffeurs
  fondateurs pendant 30 jours puis 12% standard. Ne pas passer au-dela avant
  d avoir prouve, sur au moins 500 courses, que le revenu net chauffeur, la
  retention rider et la contribution Orbi restent conformes aux seuils Go / No Go.
- Regler la commission par course sur des paliers de 10 XOF, sans depasser le
  taux de commission annonce. Cela evite des montants comme 261 XOF sans
  sacrifier trop de marge projet. Les paliers 50/100 XOF doivent etre geres au
  moment des reglements groupes, avec reliquat conserve dans le wallet.
- Proteger le temps des chauffeurs contre les annulations rider repetees:
  la premiere annulation de demande reste claire et gratuite, la deuxieme avertit
  doucement, la troisieme signale un risque de revue, et la quatrieme sur 24h
  ouvre un ticket support. Orbi ne facture pas automatiquement une micro-penalite
  difficile a gerer en cash; les frais eventuels doivent rester explicites,
  audites et traites par support quand un chauffeur a deja ete mobilise.
- Pour les courses deja matchees, Orbi suggere des frais ronds uniquement en
  revue support: 200 XOF apres match, 300 XOF quand le chauffeur arrive, avec
  +100 XOF si le rider multiplie les annulations recentes, cappe a 500 XOF.
  La recommandation reserve 80% de ce frais au chauffeur et 20% au projet pour
  couvrir support, paiement et risque operationnel. Aucun montant comme 264 XOF
  ne doit apparaitre dans cette logique.
- La symetrie est obligatoire: un chauffeur qui annule apres acceptation est
  aussi suivi sur 24h. La premiere annulation est enregistree, la deuxieme met
  le compte en risque operationnel, la troisieme ouvre une revue support avec
  pause operationnelle de 30 minutes avant nouvelles offres: le profil repasse
  hors ligne et le retour online est bloque dans cette fenetre. Cette regle
  protege le passager contre les annulations opportunistes sans punir un
  chauffeur pour une vraie urgence terrain; le support peut ensuite documenter
  le contexte et lever le doute operationnel.

### Operateur

- Eviter une guerre de prix destructrice.
- Preferer un pricing qui construit retention et confiance.
- Preserver une marge saine pour le support, la securite, le paiement et les operations.
- Ne pas confondre objectif long terme et pilote: le premier test doit maximiser
  la densite chauffeur et la confiance. La marge se construit ensuite par volume,
  B2B, discipline support et reduction des trajets a vide.

## Grille pilote active

| Produit | Base | Distance | Temps | Frais service | Minimum | Commission |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Moto Ouagadougou | 200 XOF | 110 XOF/km | 20 XOF/min | 50 XOF | 650 XOF | 10% puis 12% |
| Voiture Ville | 500 XOF | 240 XOF/km | 45 XOF/min | 100 XOF | 1 500 XOF | 10% puis 12% |
| Voiture Confort | 700 XOF | 300 XOF/km | 55 XOF/min | 150 XOF | 2 000 XOF | 10% puis 12% |

Les zones semi-urbaines et bordures urbaines gardent une variation moderee pour
rester accessibles, mais les prix de reference ci-dessus sont ceux du coeur
pilote de Ouagadougou. Le multiplicateur de demande est plafonne a 1,30 pendant
le pilote et doit toujours etre explique avant confirmation.

## Sources de contexte utilisees

- Benchmark local Okalm, LetsGo et taxis/app Burkina:
  `docs/competitive-pricing-burkina-2026.md`
- Yango met en avant prix visible d avance et tarification locale par ville:
  https://yango.com/support/taxi-all-app-yango/about.html
- Exemple de fare detaille dans une ville ouest-africaine:
  https://yango.com/en_int/thies/tariff/econom
- Contexte urbain Burkina et poids de Ouagadougou/Bobo:
  https://www.cim-burkina.com/en/pagina/burkina-faso
- Annuaire statistique transport Burkina:
  https://www.transports.gov.bf/fileadmin/user_upload/Annuaire_statistique_2020_du_secteur_des_transport.pdf

## Ce qu il faudra faire ensuite

- alimenter les profils de ville/quartier avec de vraies donnees operationnelles,
- enrichir le resolver geographique partage avec des polygones et un store configurable,
- brancher la calibration admin sur des fenetres croisees ville, quartier et heure,
- ajuster la commission et les caps par fenetres horaires et categories,
- ajouter un moteur de fairness pilote par telemetry plutot que par heuristiques seules.
