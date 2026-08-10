# Parcours recherche et lieux Rider

## Objectif

Le parcours Rider doit permettre de choisir rapidement un depart et une destination meme quand l'adresse est incomplete, mal orthographiee ou exprimee par quartier, lieu connu ou repere.

## Comportement implemente

- Le depart et la destination sont distingues dans le recapitulatif, les champs de recherche et la correction sur carte.
- Les favoris du profil alimentent les suggestions de depart et de destination.
- Les destinations recentes alimentent uniquement la recherche de destination.
- Les reperes locaux Burkina viennent des presets et lieux locaux partages par `PlaceSearch`.
- La saisie manuelle est possible quand aucun resultat n'est trouve.
- La position actuelle peut etre utilisee comme depart si les coordonnees locales sont valides.
- La carte permet de corriger le depart ou la destination via un selecteur explicite.
- Les points choisis sur carte affichent un libelle fonctionnel, sans latitude ni longitude brutes.

## Confidentialite et securite

- Les recherches ne sont pas journalisees cote mobile.
- Les requetes distantes sont debounced a 600 ms.
- Une nouvelle saisie annule la requete precedente avec `AbortController`.
- Les resultats reseau arrives apres annulation sont ignores.
- Les recherches locales suffisantes evitent un appel distant inutile.
- Les coordonnees issues de la position ou de la carte sont validees avant usage.
- L'historique visible est borne: seules quelques destinations recentes sont proposees.
- Les messages affiches restent fonctionnels: connexion lente, lieu manuel, point carte inutilisable.

## Dependances externes

- `expo-location`: position locale du passager, soumise aux permissions du systeme.
- Nominatim / OpenStreetMap: recherche distante de lieux quand les suggestions locales ne suffisent pas.
- WebView + Leaflet/CARTO tiles via `TripMapView`: rendu carte et correction de point.
- Aucune cle cartographique n'est introduite dans ce changement. Si un fournisseur payant est ajoute, la cle devra rester cote configuration secrete ou proxy backend, jamais en dur dans l'app.

## Recherche vocale

Aucune recherche vocale fonctionnelle n'a ete trouvee dans le code Rider actuel pour ce parcours. Elle n'est donc pas exposee dans l'UI. Une future implementation devra verifier les permissions micro, la transcription, l'annulation et la confidentialite avant affichage.

## Tests ajoutes

- Suggestions recentes, favoris et reperes dans la recherche booking.
- Saisie manuelle d'une adresse imparfaite.
- Utilisation de la position actuelle sans affichage de coordonnees brutes.
- Correction du depart et de la destination via la carte.
- Garde-fou statique sur debounce, annulation, absence de logs et messages non techniques.
