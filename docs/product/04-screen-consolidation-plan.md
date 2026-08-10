# Plan de consolidation des ecrans Rider et Driver

Date: 2026-08-10  
Contrainte: plan produit uniquement, aucun code modifie.

## Objectif

Reduire la densite des ecrans actuels sans perdre les flux metier. Les apps doivent avoir moins de doublons, plus de surfaces dediees aux decisions critiques, moins d'informations techniques visibles, et des parcours lisibles pour beta/pilote.

## Principes

- Garder les tabs comme navigation principale.
- Transformer les gros ecrans en parcours par etapes quand l'utilisateur prend une decision.
- Sortir wallet, support, documents et settings des ecrans "profil/compte".
- Afficher les etats metier en langage utilisateur, pas en reference technique.
- Garder les ids, references provider, contraintes fichier et statuts techniques dans les details ou support, pas dans le premier niveau.
- Prevoir un vrai mode offline/degrade par app.

## Consolidation Rider proposee

| Priorite | Zone | Probleme actuel | Decision proposee | Routes ciblees | Impact |
|---|---|---|---|---|---|
| P1 | Booking | `/book` fait recherche, devis, service, paiement, promo, demande. | Garder une route booking mais organiser en etapes internes: destination -> devis/service -> paiement -> confirmation. | `/book` | Moins de surcharge, meilleure conversion. |
| P1 | Active ride | `home` et `activity` affichent tous deux le flux actif. | Faire de `activity` la source active; `home` ne montre qu'un resume compact. | `/home`, `/activity` | Moins de doublons et de divergences. |
| P1 | Pickup code | Code/verification embarquement non prioritaire. | Ajouter une sous-etape visible dans `activity` quand chauffeur arrive. | `/activity` ou `/pickup-code` | Securite terrain. |
| P1 | OTP | Aucun ecran mobile. | Ajouter verification telephone apres sign-up et avant paiement mobile money. | `/auth/otp` ou etape auth | Confiance et paiements. |
| P1 | Wallet | Wallet enfoui dans compte. | Creer route portefeuille avec solde, top-up, historique, paiement en attente. | `/wallet` | Clarte argent. |
| P2 | Support | Support disperse. | Creer support central, relier receipt/activity/account vers lui avec contexte. | `/support` | Moins de tickets incomplets. |
| P2 | Account | Trop de formulaires dans compte. | Garder profil identite, logout, raccourcis vers Wallet/Support/Settings/Favoris. | `/account` | Profil plus lisible. |
| P2 | Favorites | Lieux favoris et coordonnees dans account. | Deplacer vers "Lieux favoris"; cacher lat/lng derriere mode avance ou carte. | `/saved-places` | Moins technique. |
| P2 | Trips | Redondant avec Activity. | Renommer en Historique strict; ne pas afficher demandes actives sauf lien vers Activity. | `/trips` | Navigation plus claire. |
| P2 | Permissions | Demandes opportunistes. | Ajouter onboarding permissions position/push + settings de reprise. | `/onboarding`, `/settings` | Moins de refus permission. |
| P3 | Receipt | Recu et finalisation paiement melanges. | Garder, mais mettre paiement en bloc separable et support en lien contextuel. | `/receipt` | Lisibilite. |

### Navigation Rider cible

- Tab 1: Accueil (`/home`) - carte, destination CTA, resume actif compact.
- Tab 2: Activite (`/activity`) - demande/course active prioritaire; historique court.
- Tab 3: Historique (`/trips`) - courses passees, recus, rebook.
- Tab 4: Compte (`/account`) - profil, settings, wallet, support, favoris en entrees.
- Routes hors tabs: `/book`, `/wallet`, `/support`, `/saved-places`, `/settings`, `/receipt`, `/rating`, `/auth/otp`.

## Consolidation Driver proposee

| Priorite | Zone | Probleme actuel | Decision proposee | Routes ciblees | Impact |
|---|---|---|---|---|---|
| P1 | Mission active | `offres` melange liste et mission. | Creer une surface mission active prioritaire: approche -> arrivee -> code -> trajet -> fin. | `/mission` ou mode dedie dans `/offres` | Moins d'erreurs terrain. |
| P1 | Offre | Offre visible dans accueil et offres avec comportements differents. | Unifier composant et action accept/refus; accueil affiche seulement resume ou modal partagee. | `/accueil`, `/offres` | Decisions coherentes. |
| P1 | Documents | Onboarding checkbox + profil filename/link. | Remplacer par vrai flux documents: camera/fichier -> upload -> statut -> renouvellement. | `/documents` | Pilote chauffeurs possible. |
| P1 | Onboarding/profil | Deux formulaires concurrents. | Un moteur de formulaire commun; onboarding initial appelle les memes sections que profil. | `/onboarding`, `/profil` | Moins de dette et bugs. |
| P1 | Code passager | API disponible mais ecran non visible. | Ajouter etape de saisie/verification code avant demarrage. | `/mission/code` | Securite embarquement. |
| P1 | Suspension | Bannieres seulement. | Creer ecran suspension avec raison, actions support, documents a corriger. | `/suspension` | Moins de confusion chauffeur. |
| P2 | Wallet/retraits | Revenus sans action retrait. | Ajouter portefeuille driver, payout, retraits, historique settlement. | `/wallet`, `/payouts` | Clarte argent. |
| P2 | Revenus | Bon tableau mais trop settlement technique. | Garder KPIs; deplacer details reconciliation dans "payouts". | `/revenus` | Plus lisible. |
| P2 | Support | Support dans profil et incidents dans offres. | Support driver central avec categories paiement/course/documents/suspension. | `/support` | Meilleure resolution. |
| P2 | Historique | Pas de route historique dediee. | Ajouter historique missions ou section claire dans revenus. | `/history` ou `/revenus/history` | Meilleure preuve chauffeur. |
| P3 | Accueil | Sheet dynamique chargee. | Garder seulement online/offline, gain du jour, prochain risque/alerte. | `/accueil` | Ecran plus rapide. |

### Navigation Driver cible

- Tab 1: Accueil (`/accueil`) - online/offline, gain du jour, etat compte, resume offre/mission.
- Tab 2: Missions (`/offres` + `/mission`) - offres disponibles ou mission active pleine page.
- Tab 3: Revenus (`/revenus`) - revenus jour/semaine/mois et dernieres courses.
- Tab 4: Profil (`/profil`) - identite, vehicule, validation; liens vers Documents/Support/Wallet.
- Routes hors tabs: `/documents`, `/wallet`, `/payouts`, `/support`, `/suspension`, `/mission/code`.

## Ecrans a conserver

- Rider: `/auth`, `/home`, `/book`, `/activity`, `/receipt`, `/rating`.
- Driver: `/auth`, `/accueil`, `/offres`, `/revenus`.
- Layouts et redirects des deux apps.

## Ecrans a simplifier

- Rider: `/book`, `/activity`, `/account`, `/trips`.
- Driver: `/accueil`, `/offres`, `/profil`, `/onboarding`.

## Ecrans a deplacer ou extraire

- Rider: wallet, support, favoris, settings, OTP, permissions.
- Driver: documents, wallet, payouts/retraits, suspension, mission active, code passager, support.

## Ecrans a supprimer ou fusionner

- Rider: aucun fichier a supprimer immediatement; `trips` doit devenir historique strict ou etre fusionne dans `activity`.
- Driver: `/onboarding` ne doit pas rester un formulaire separe long terme; il doit reutiliser les sections de `/profil` ou devenir un wrapper de premiere configuration.

## Donnees techniques a masquer en priorite

- References paiement/provider et transaction refs hors recu/detail support.
- Coordonnees latitude/longitude dans le compte Rider.
- Contraintes techniques de liens documents dans profil Driver.
- Scores internes d'offre driver si non expliques simplement.
- Statuts realtime bruts ou semi-techniques.
- Debug crash details dans tout build non interne.

## Ordre recommande avant beta

1. Ajouter OTP Rider/Driver et parcours permissions.
2. Corriger les surfaces critiques: code pickup Rider/Driver, mission active Driver, active ride Rider.
3. Extraire wallet/support des profils.
4. Unifier onboarding/profil Driver et remplacer checkboxes documents par upload reel.
5. Simplifier home/activity/trips Rider et accueil/offres Driver.
6. Ajouter ecrans suspension, documents expires, wallet/payout Driver.
7. Revoir textes UI pour retirer les statuts techniques et harmoniser les etats vides/erreurs/offline.
