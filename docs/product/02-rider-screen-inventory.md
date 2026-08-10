# Inventaire des interfaces Rider

Date: 2026-08-10  
Portee: `apps/rider-app/app`, `apps/rider-app/lib`, composants de booking, hooks realtime/position/session, appels `@orbi/api`.  
Contrainte: aucun ecran modifie.

## Synthese Rider

L'application Rider expose peu de routes mais beaucoup d'etapes metier dans des ecrans tres denses. Les routes reelles sont: `/`, `/_layout`, `/auth`, `/(tabs)/home`, `/book`, `/(tabs)/activity`, `/(tabs)/trips`, `/(tabs)/account`, `/receipt`, `/rating`.

Les etapes attendues lancement, accueil, carte, recherche, destination, devis, choix du service, paiement, demande, recherche chauffeur, chauffeur trouve, arrivee, code, trajet, arrivee destination, recu et notation existent en grande partie, mais plusieurs ne sont pas des ecrans autonomes. OTP, onboarding rider, permissions et parametres dedies manquent comme surfaces explicites.

## Routes reelles

| Application | Route | Fichier | Composant | Objectif utilisateur | Action principale | Actions secondaires | Donnees necessaires | Endpoint ou service utilise | Etat metier attendu | Chargement | Vide | Erreur | Hors connexion | Problemes UI | Problemes UX | Donnees techniques exposees | Statut |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rider | `/` | `apps/rider-app/app/index.tsx` | Index redirect | Diriger vers auth ou accueil. | Redirection session. | Aucun. | Session locale. | `hasPersistedRiderSession`. | Non connecte ou connecte. | Splash court. | N/A. | Fallback auth si lecture session echoue. | Utilisable si storage lisible. | Pas de choix manuel. | Ecran purement technique. | Aucun visible. | Conserver. |
| Rider | `/_layout` | `apps/rider-app/app/_layout.tsx` | RootLayout | Charger fonts, theme, notifications, guard session. | Afficher app ou auth. | Deep link notification vers activite/recu. | Fonts, session, payload notification. | `hasPersistedRiderSession`, `reportRiderRenderCrash`. | Session valide ou auth requise. | Splash `orbi` + spinner. | N/A. | ErrorBoundary. | Peut rester bloque si fonts/session long. | Debug details activables par env. | Route guard global invisible mais centralise trop de logique. | `EXPO_PUBLIC_DEBUG_CRASH_DETAILS` peut afficher details crash. | Conserver, durcir debug. |
| Rider | `/auth` | `apps/rider-app/app/auth.tsx` | RiderAuthScreen | Connexion ou creation compte passager. | Se connecter / creer compte. | Afficher/masquer mot de passe, bascule mode. | Email, mot de passe, nom complet en sign-up. | `signInRiderAccount`, `signUpRiderAccount`, auth API. | Non connecte. | Bouton loading. | N/A. | Banner "Connexion refusee". | Message reseau via resolver auth. | Pas d'OTP telephone malgre besoin mobile money/local. | Sign-in et sign-up fusionnes; pas recuperation mot de passe. | Legal links en texte non cliquable; screen capture appellee mais no-op. | Conserver, ajouter OTP/forgot password. |
| Rider | `/(tabs)/home` | `apps/rider-app/app/(tabs)/home.tsx` | RiderHomeScreen | Demarrer une course ou suivre le statut courant. | Aller a `/book`. | SOS, partager course, annuler/arreter flux actif, ouvrir activite. | Session, options de course, historique, position, chauffeurs proches. | `fetchRideOptionsPreview`, `fetchMyTrips`, `HomeMapView`, `useRiderPosition`, `useRiderRealtimeStream`, `createTripShareLinkWithApi`, `triggerTripSafetySosWithApi`, `updateTripStatusWithApi`, `cancelRideRequestWithApi`. | Aucun flux, demande active, chauffeur trouve, chauffeur en route, trajet actif. | Map/sheet affiches pendant refresh; badge realtime. | Services fallback si options absentes. | Alert/banners; certaines erreurs SOS redirigent vers activite. | OfflineBanner "dernier etat"; refresh live continue. | Carte plein ecran + sheet fixe peut masquer contenu sur petits ecrans. | Trop de responsabilites: accueil, carte, statut actif, mini support/SOS. | Nombre de chauffeurs proches; statut realtime; URL partage base API. | Conserver, simplifier. |
| Rider | `/book` | `apps/rider-app/app/book.tsx` | BookingScreen | Construire et confirmer une reservation. | Envoyer demande de course. | Choisir depart/destination, carte, service, paiement, code promo, course programmee, sauvegarder lieu. | Session, profil, historique, position, presets Burkina, lieux favoris, chauffeurs proches, options, paiement. | `fetchRideOptionsPreview`, `fetchNearbyDrivers`, `fetchMyTrips`, `fetchRiderProfile`, `createRideRequestWithApi`, `createCheckoutIntentWithApi`, `validatePromoCodeWithApi`, `createSavedPlaceWithApi`, `useRiderRealtimeStream`, `PlaceSearch`, `TripMapView`. | Devis en cours, service choisi, paiement choisi, demande envoyee, paiement lance, flux actif. | `isRefreshing`, `isSubmitting`, overlay confirmation. | Destination vide; aucun chauffeur proche; options fallback limitees. | Status message via `resolveRiderAppError`. | Blocage partiel sur reseau; peut afficher derniers presets. | Ecran tres long; CTA fixe + nombreux panneaux; risque surcharge. | Melange recherche, devis, scheduled ride, promo, paiement et creation; pas de wizard clair. | Transaction ref provider apres paiement; contraintes paiement; realtime status. | Conserver, diviser en etapes. |
| Rider | `/(tabs)/activity` | `apps/rider-app/app/(tabs)/activity.tsx` | ActivityScreen | Suivre demande/course active et support rapide. | Suivre/agir sur la course active. | Annuler demande/course, terminer, SOS, partage, incident, preuve volontaire, tickets support rapides. | Session, historique, trip detail, support tickets, position. | `fetchMyTrips`, `fetchTripDetail`, `getMySupportTicketsWithApi`, `cancelRideRequestWithApi`, `updateTripStatusWithApi`, `reportTripIncidentWithApi`, `triggerTripSafetySosWithApi`, `createTripShareLinkWithApi`, `createSupportTicketWithApi`, `useRiderRealtimeStream`, `TripMapView`. | Recherche chauffeur, matched, driver arriving, in progress, completed, no active flow. | Pull refresh; status "Chargement"; retry reseau. | Historique/support vide. | Banners et alerts; trip detail degrade si indisponible. | Message "trajets affiches des que connexion revient"; garde dernier fallback. | Beaucoup d'actions critiques en un seul ecran. | Le passager peut "terminer" lui-meme une course in progress; preuve volontaire sans upload peut etre confuse. | Plaque, telephone chauffeur, statut paiement, reference paiement. | Conserver, clarifier actions critiques. |
| Rider | `/(tabs)/trips` | `apps/rider-app/app/(tabs)/trips.tsx` | TripsScreen | Voir historique et relancer un trajet. | Ouvrir recu ou suivi. | Refaire trajet, reserver. | Session, historique. | `fetchMyTrips`, `normalizeRiderTripsResponse`. | Demandes en attente, courses recentes, statistiques. | RefreshControl. | Card "Aucune course". | Status text. | Message reseau; pas de cache persistant dedie. | Stats nombreuses sur mobile. | Chevauchement fonctionnel avec Activity. | Status metier brut transforme; montants. | Fusionner partiellement avec Activity ou renommer. |
| Rider | `/(tabs)/account` | `apps/rider-app/app/(tabs)/account.tsx` | AccountScreen | Gerer profil, wallet, favoris, contacts, support. | Mettre a jour donnees compte. | Top-up wallet, favoris, geocoding, contacts de confiance, tickets support, logout, reserver. | Profil, historique, wallet, tickets, formulaires, lieux, contacts. | `fetchRiderProfile`, `fetchMyTrips`, `fetchWalletBalanceWithApi`, `initiateWalletTopUpWithApi`, `create/update/deleteSavedPlaceWithApi`, `create/update/deleteTrustedContactWithApi`, `get/createSupportTicketWithApi`, direct Nominatim fetch. | Compte actif, wallet normal/verrouille, contacts/favoris, flow actif. | ActivityIndicator header, refresh live. | Wallet `-- XOF`; aucun contact/favori/ticket. | Status banner. | Geocoding impossible; profil recharge au retour reseau. | Ecran tres surcharge; refresh button cache `display:none`. | Profil, portefeuille, support, favoris et securite devraient etre separes. | Coordonnees latitude/longitude visibles et editables; "Identite masquee". | Deplacer/fusionner en sous-ecrans. |
| Rider | `/receipt` | `apps/rider-app/app/receipt.tsx` | ReceiptScreen | Consulter et finaliser le recu. | Partager / payer / evaluer. | Refaire trajet, signaler probleme, retour accueil. | `tripId`, detail course, profil si paiement. | `fetchTripDetail`, `fetchRiderProfile`, `createCheckoutIntentWithApi`, `reportTripIncidentWithApi`, Share API. | Course terminee, paiement regle ou a finaliser. | Centered spinner. | N/A si `tripId` absent -> erreur. | Ecran erreur "Recu indisponible". | Recu indisponible sans cache local. | Actions nombreuses mais utiles. | Visual QA fixture integree par env; signalement silencieux en catch. | Reference trip tronquee, provider, transaction ref, plaque, chauffeur. | Conserver, extraire paiement final. |
| Rider | `/rating` | `apps/rider-app/app/rating.tsx` | RatingScreen | Noter le trajet. | Envoyer evaluation. | Passer, commentaire. | `tripId`, driverName, fare, destination. | `rateTripWithApi`. | Course terminee non notee. | Loading bouton submit. | Score 0 avec prompt. | Banner "Evaluation non envoyee". | Pas de mode offline/queue. | Simple et lisible. | Depend de params route, pas de fetch fallback detail. | Note resultat affichee. | Conserver. |

## Etapes metier attendues Rider

| Etape demandee | Couverture actuelle | Route/fichier | Utilite reelle | Probleme principal | Statut |
|---|---|---|---|---|---|
| Lancement | Oui | `/_layout`, `/` | Splash et routage session. | Pas de diagnostic si session/fonts bloquent. | Conserver. |
| Onboarding | Non dedie | N/A | Expliquer Orbi, permissions, paiement, securite. | Absent; auth attaque directement compte. | Ecran manquant. |
| Authentification | Oui | `/auth` | Connexion/sign-up email. | Pas de forgot password ni auth telephone. | Conserver. |
| OTP | Non comme ecran | Backend auth OTP existe, mobile non expose. | Verifier numero local. | Manquant critique pour mobile money/confiance. | Ecran manquant. |
| Permissions | Partiel | `useRiderPosition`, `use-push-registration` | Position/push demandes au fil de l'eau. | Pas de pedagogie ni retry centralise. | Deplacer vers onboarding/settings. |
| Accueil | Oui | `/home` | Carte et point d'entree booking. | Trop d'etats actifs dans home. | Simplifier. |
| Carte | Oui | `HomeMapView`, `TripMapView`, `SavedPlacesMap` | Visualiser chauffeurs/trajet/favoris. | Leaflet WebView et dependances externes; experiences fragiles. | Conserver. |
| Recherche | Oui | `/book`, `PlaceSearch` | Chercher depart/destination. | Dans un ecran booking surcharge. | Extraire/simplifier. |
| Destination | Oui | `/book` | Definir destination. | Pas d'etape dediee; carte + champs concurrents. | Simplifier. |
| Devis | Oui | `/book` | Voir prix/distance/ETA. | Depend presets si coords absentes. | Conserver. |
| Choix du service | Oui | `/book`, `/home` | Moto/voiture/service tier. | Doublon suggestions home/book. | Fusionner logique. |
| Paiement | Oui | `/book`, `/receipt`, `/account` | Choisir methode, lancer checkout, top-up. | Paiement disperse sur 3 surfaces. | Deplacer vers wallet/paiement dedie. |
| Demande | Oui | `/book` | Creer ride request. | Etat apres demande redirige vite vers Activity. | Conserver. |
| Recherche chauffeur | Oui | `/activity`, `/home` | Suivre demande pending. | Pas d'ecran dedie rassurant. | Fusionner avec active trip. |
| Chauffeur trouve | Oui | `/home`, `/activity` | Card matched, chauffeur, plaque. | Animation home + details activity dupliques. | Fusionner. |
| Arrivee chauffeur | Oui | `/activity` | Verifier chauffeur/vehicule. | Pickup code pas mis au premier plan. | Simplifier. |
| Code | Partiel | `/activity`, trip detail | Pickup code present cote data. | Pas d'ecran/verrou UX explicite. | Ecran/sous-etape manquante. |
| Trajet | Oui | `/activity` | Suivi carte, ETA, SOS. | Trop d'actions secondaires. | Conserver. |
| Arrivee destination | Partiel | `/activity` -> `/receipt` | Transition completion. | Pas d'ecran arrivee clair avant recu. | Simplifier. |
| Recu | Oui | `/receipt` | Facture, paiement, partage. | Visual QA fixture et paiement final melanges. | Conserver. |
| Notation | Oui | `/rating` | Evaluer chauffeur. | Pas de relance si skip. | Conserver. |
| Historique | Oui | `/trips` | Liste trajets. | Redondant avec Activity. | Fusionner/simplifier. |
| Portefeuille | Partiel | `/account` | Solde et top-up. | Enfoui dans Compte; pas historique top-up affiche. | Deplacer. |
| Support | Partiel | `/activity`, `/account`, `/receipt` | Tickets et incidents. | Support disperse. | Fusionner. |
| Profil | Oui | `/account` | Identite masquee, stats. | Trop charge. | Simplifier. |
| Parametres | Partiel | `/account` | Langue importee mais peu visible; logout. | Pas de route settings. | Ecran manquant. |

## Incoherences et doublons principaux

- `home`, `activity` et `trips` representent tous un flux actif ou historique.
- Le support est present dans `activity`, `account` et `receipt` sans centre unique.
- Le paiement est present dans `book`, `receipt` et `account`.
- La recherche de lieux utilise `PlaceSearch` et aussi un fetch Nominatim direct dans `account`.
- Les permissions position/push ne sont pas expliquees comme un parcours utilisateur.
- `account` expose latitude/longitude et fonctions de gestion avancee dans un ecran de profil.
- Plusieurs elements techniques peuvent apparaitre: statut realtime, reference paiement, transaction provider, coordonnees.

## Ecrans manquants Rider

- Onboarding passager.
- Verification OTP / telephone.
- Permissions position/push avec explication.
- Parametres dedies.
- Wallet dedie avec historique recharges.
- Centre support dedie.
- Pickup code / verification embarquement comme sous-ecran prioritaire.
- Etat offline dedie avec actions possibles.

## Ecrans inutiles ou a fusionner

- `/(tabs)/trips` peut etre fusionne avec `/(tabs)/activity` ou devenir "Historique" strict sans actif.
- Les blocs support de `receipt` et `account` devraient pointer vers un support central.
- Les blocs wallet de `account` devraient devenir une route portefeuille.
