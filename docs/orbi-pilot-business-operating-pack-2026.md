# Orbi Pilot Business Operating Pack 2026

Date de reference: 26 juillet 2026.

Ce pack transforme la strategie Orbi en execution terrain. Il doit etre utilise
avant tout test public payant et mis a jour chaque semaine pendant le pilote.

## Sources publiques utilisees

- INSD/RGPH 2019: Burkina Faso 20,5 millions d habitants, population tres jeune,
  Ouagadougou et Bobo-Dioulasso concentrent une part majeure de l urbain.
- GlobalPetrolPrices, 20 juillet 2026: essence Burkina Faso a 850 XOF/litre.
- BCEAO, rapports 2024 publies en 2026: progression forte de la monnaie
  electronique dans l UEMOA, mais besoin de prestataires autorises.
- BCEAO, liste des etablissements de paiement agrees au 28 fevrier 2026: deux
  structures indiquees pour le Burkina Faso; verifier la liste la plus recente
  avant signature.
- ARCEP Burkina Faso: observatoires mobile et internet disponibles, dont T1
  2026; Orbi doit rester concu pour Android modeste et connexion instable.
- Okalm: prix estime avant validation, cash et paiement in-app, role
  d intermediaire et commission chauffeur visible dans les CGU.
- LetsGo: taxis electriques a Ouagadougou, offres Sahel/Premium, paiement cash
  et mobile selon disponibilite, pas de grille publique stable.

## Point de depart exact

1. Nommer un responsable pilote unique.
2. Geler les fonctionnalites non critiques pendant 30 jours.
3. Ouvrir les dossiers: transport, CIL, paiement, assurance, contrats,
   comptabilite, support, incidents, tests techniques.
4. Choisir 15 trajets de reference a Ouagadougou.
5. Demarrer la veille concurrentielle pendant 14 jours.
6. Recruter 20 a 30 motos et 5 a 10 voitures seulement.
7. Realiser 50 trajets supervises et rapproches un par un.
8. Passer au pilote ferme 300 a 500 courses seulement si les seuils sont atteints.

## Interlocuteurs a contacter

| Priorite | Structure | Objet | Document a preparer |
| --- | --- | --- | --- |
| 1 | Juriste transport + Ministere charge des Transports | qualification activite, motos, voitures, assurance, responsabilite | note modele Orbi, flux course, contrats |
| 2 | CIL Burkina Faso | geolocalisation, identite, trajets, pieces conducteurs, support | registre traitements, politique confidentialite, durees |
| 3 | Prestataire de paiement autorise / banque | mobile money, cash ledger, remboursements, reversements | schema flux financiers, SLA, exports |
| 4 | Assureur / courtier | RC, passagers, accidents, cyber, fraude | processus incidents, criteres conducteurs |
| 5 | Associations conducteurs, garages, flottes | recrutement et inspection | charte conducteur, grille inspection |
| 6 | Universites, entreprises, hotels | premiers corridors et comptes pilotes | offre pilote, prix plafonnes, support |

## Tarification pilote a configurer

Prix passager = arrondi XOF de `max(minimum, base + distance * km + duree * minute)
* coefficient + ajustements - soutiens + frais paiement`.

| Produit | Base | Km | Minute | Frais service | Minimum | Commission |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Orbi Moto | 200 | 110 | 20 | 50 | 650 | 10% J0-J30, puis 12% |
| Orbi Voiture Ville | 500 | 240 | 45 | 100 | 1 500 | 10% J0-J30, puis 12% |
| Orbi Confort | 700 | 300 | 55 | 150 | 2 000 | 10% J0-J30, puis 12% |

Plafonds: demande forte 1,10 a 1,15; pic exceptionnel 1,22 a 1,30; aucun
coefficient au-dela de 1,30 pendant le pilote. Ne pas facturer la distance
d approche chauffeur comme ligne cachee au passager.

## Questionnaire passager

Identifiant repondant:
Date, heure, zone:
Segment: etudiant / salarie / femme utilisatrice reguliere / entreprise /
hotel-visiteur / autre.

1. Quel trajet avez-vous fait hier ou lors de votre dernier deplacement payant?
2. Origine, destination, heure, duree estimee.
3. Moyen utilise: moto, taxi collectif, taxi direct, conducteur connu, voiture
   personnelle, marche, autre.
4. Prix paye exactement ou fourchette.
5. Temps d attente avant depart.
6. Probleme principal rencontre: prix, attente, securite, confort, negociation,
   paiement, disponibilite, autre.
7. Combien de trajets similaires faites-vous par semaine?
8. Prix acceptable pour 2 km, 5 km, 8 km en moto.
9. Prix acceptable pour 2 km, 5 km, 8 km en voiture.
10. A partir de quel prix refuseriez-vous une course moto de 5 km?
11. A partir de quel prix refuseriez-vous une course voiture de 5 km?
12. Attente maximale acceptable avant abandon.
13. Mode de paiement prefere: cash, mobile money, wallet, carte, entreprise.
14. Ce qui ferait changer de solution: prix fixe, chauffeur verifie, rapidite,
    support, partage trajet, confort, facture, autre.
15. Consentement a etre invite au pilote: oui / non; telephone separe si oui.

## Questionnaire conducteur

1. Vehicule: moto / voiture; modele; annee; proprietaire.
2. Zone habituelle et horaires travailles.
3. Recette brute moyenne par jour.
4. Depenses carburant par jour et litres achetes.
5. Maintenance moyenne par semaine ou mois.
6. Nombre de courses par jour et temps d attente moyen.
7. Kilometres approximatifs a vide.
8. Revenu net juge acceptable par heure.
9. Commission acceptable si Orbi apporte des courses regulieres.
10. Delai de paiement souhaite.
11. Craintes: faux clients, impayes, controle plateforme, police, assurance,
    smartphone, data, annulation.
12. Documents disponibles: CNIB, permis, carte grise, assurance, visite.
13. Telephone Android, GPS et data: bon / moyen / faible.
14. Acceptation d un code de prise en charge obligatoire.
15. Acceptation d une periode probatoire avec score et formation.

## Formulaire de veille concurrentielle

Pendant 14 jours, relever 15 paires origine-destination a 07h30, 12h30, 18h00
et 22h30. Ne pas creer de fausses courses; les tests d execution doivent etre de
vraies courses payees.

| Date | Heure | Origine | Destination | Km | Concurrent | Produit | Prix | Attente | Promo | Meteo/trafic | Observation |
| --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | --- | --- | --- |

Decision: Orbi doit viser 0 a 10% sous la mediane concurrente sur les trajets
ordinaires, jamais sous le minimum promotionnel temporaire si cela detruit la
marge chauffeur.

## Fiche trajet supervise

- ID trajet, date, conducteur, passager, vehicule.
- Heure demande, acceptation, arrivee, code valide, depart, fin, paiement, recu.
- Prix affiche, prix facture, ecart.
- Distance, duree, zone, trafic.
- Identite chauffeur conforme, plaque conforme, support joignable.
- Retour passager dans les 10 minutes.
- Retour conducteur dans les 10 minutes.
- Rapprochement financier: cash/mobile money, commission, payout, ecart.
- Decision: clos / anomalie produit / anomalie support / anomalie paiement /
  incident securite.

## Seuils Go / No Go

| KPI | Minimum pilote | Expansion |
| --- | ---: | ---: |
| Acceptation chauffeur | 65% | 80% |
| Completion courses | 80% | 90% |
| Attente mediane pickup | 12 min | 8-10 min |
| Paiement digital reussi | 90% | 97% |
| Rapprochement financier | 100% | 100% |
| Rétention rider 30 jours | 25% | 40% |
| Rétention hebdo chauffeur | 60% | 75% |
| Incidents graves non resolus | 0 | 0 |

## Regle de decision pricing

Chaque semaine, comparer trois chiffres ensemble:

- rider: conversion devis vers commande et plaintes prix;
- chauffeur: revenu net horaire et taux d acceptation;
- Orbi: contribution par course hors promotions.

Un tarif n est valide que si les trois restent bons. Le prix le plus bas n est
pas forcement le meilleur: le bon prix est celui qui maximise les courses
repetees et la contribution totale sans appauvrir les chauffeurs.
