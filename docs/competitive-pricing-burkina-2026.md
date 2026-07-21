# Benchmark pricing Burkina Faso

Date de reference: 20 juillet 2026.

## Sources publiques verifiees

- Okalm conditions generales: https://www.okalm-app.com/terms-condition
- Okalm taxi: https://okalm-app.com/taxi
- LetsGo accueil: https://www.letsgo-app.com/
- LetsGo about: https://www.letsgo-app.com/index.php/about-us
- Article Sahel Matin sur LetsGo: https://sahelmatin.com/burkina-faso-lancement-officiel-du-premier-service-de-taxis-100-electriques-letsgo/
- Wikivoyage Ouagadougou: https://en.wikivoyage.org/wiki/Ouagadougou

## Ce que les concurrents rendent public

Okalm documente un prix estime avant validation, des moyens de paiement cash,
wallet et electroniques, une tarification qui peut varier selon la demande, le
trafic ou l heure, et une commission prelevee cote chauffeur selon les modalites
visibles dans l espace chauffeur. La page taxi indique aussi que le tarif depend
de la distance couverte et que le rider recoit une estimation apres le choix du
type de vehicule.

LetsGo communique surtout une promesse de taxis 100% electriques a Ouagadougou,
avec gammes Sahel, Premium et Lux, suivi temps reel et paiement cash/mobile. Les
pages publiques parlent de tarifs competitifs, mais ne publient pas de grille
chiffree ni de modele de commission chauffeur.

Les guides locaux rappellent que le taxi informel reste souvent negocie avant la
course, tandis que les apps donnent un prix fixe ou estime. Cela confirme que la
promesse la plus forte pour Orbi est la lisibilite du prix avant course, pas une
course aveugle au moins cher.

## Position Orbi recommandee

Orbi doit rester plus transparent que le marche:

- prix upfront visible avant validation,
- prix CFA arrondi proprement vers le haut pour eviter les montants difficiles
  a rendre en monnaie, avec protection anti-exces pour rester accessible,
- pas de frais caches lies a l approche chauffeur,
- dynamique de demande plafonnee,
- commission chauffeur simple: 10% en onboarding, 15% en croissance, 18% en
  regime standard,
- part chauffeur toujours visible dans les outils ops,
- paiement cash et mobile money sans rendre le cash plus opaque,
- soutien d accessibilite explicite sur les segments moto sensibles.

## Repartition juste

La politique actuelle donne au chauffeur au moins 82% du prix course hors
eventuelles charges externes non codees ici. C est volontairement meilleur pour
l adhesion chauffeur qu un take rate agressif, tout en laissant a Orbi une marge
lisible pour payer support, securite, paiement, fraude, assurance operationnelle
et croissance.

La repartition par course est aussi arrondie sur des paliers CFA pratiques de
10 XOF. Exemple en regime standard: sur 1500 XOF, le taux cible 18% donne
270 XOF; Orbi retient 270 XOF et le chauffeur recoit 1230 XOF dans son ledger.
Sur 1450 XOF, 18% donne 261 XOF; Orbi retient 260 XOF et le chauffeur recoit
1190 XOF. Les paliers 50/100 XOF doivent etre appliques au reglement groupe,
pas a chaque course, pour ne pas grignoter la marge du projet.

Le backend expose maintenant:

- `driverShareRate`,
- `platformTakeRate`,
- `driverPayoutPerKm`,
- `driverPayoutPerMinute`,
- `wealthDistributionBand`.
- `commercialRoundingAmount` et `commercialRoundingStep` dans le breakdown prix.

Ces champs permettent a l admin de verifier qu une hausse de prix ne devient pas
une rente plateforme et qu une baisse de prix ne transfere pas la perte au
chauffeur.

## Regle produit

Avant tout changement tarifaire important, verifier trois seuils ensemble:

- rider: prix comprehensible, fenetre de confiance stable, support
  accessibilite si besoin,
- chauffeur: payout net suffisant par km et par minute, commission lisible,
- operateur: take rate maximum 18% en regime standard, marge suffisante pour les
  couts reels de paiement, support, securite et acquisition.

Si un des trois seuils casse, le pricing doit passer en revue ops avant
activation.
