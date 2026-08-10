# Inventaire des interfaces Driver

Date: 2026-08-10  
Portee: `apps/driver-app/app`, `apps/driver-app/lib`, hooks presence/realtime/background-location, appels `@orbi/api`.  
Contrainte: aucun ecran modifie.

## Synthese Driver

L'application Driver expose les routes reelles suivantes: `/`, `/_layout`, `/auth`, `/onboarding`, `/(tabs)/accueil`, `/(tabs)/offres`, `/(tabs)/revenus`, `/(tabs)/profil`.

La couverture metier est riche mais tres concentree: `offres` est a la fois liste d'offres, acceptation/refus, navigation mission, arrivee, depart, trajet, fin, paiement, SOS et incidents. `profil` est a la fois profil, validation, documents, vehicule, support et edition onboarding. `onboarding` et `profil` se dupliquent fortement.

## Routes reelles

| Application | Route | Fichier | Composant | Objectif utilisateur | Action principale | Actions secondaires | Donnees necessaires | Endpoint ou service utilise | Etat metier attendu | Chargement | Vide | Erreur | Hors connexion | Problemes UI | Problemes UX | Donnees techniques exposees | Statut |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Driver | `/` | `apps/driver-app/app/index.tsx` | Index redirect | Diriger vers auth ou accueil. | Redirection session. | Aucun. | Session locale. | `hasPersistedDriverSession`. | Non connecte ou connecte. | Splash via layout. | N/A. | Auth par defaut si session illisible. | Depend storage local. | Invisible. | Route purement technique. | Aucun visible. | Conserver. |
| Driver | `/_layout` | `apps/driver-app/app/_layout.tsx` | RootLayout | Charger theme/fonts, guard session, background location, notifications. | Afficher app ou auth. | Notification `new_offer` vers missions. | Fonts, session, push payload. | `hasPersistedDriverSession`, `reportDriverRenderCrash`, `background-location-task`. | Session valide ou auth requise. | Splash `orbi` + spinner. | N/A. | ErrorBoundary. | Pas de page offline globale. | Debug details activables par env. | Beaucoup d'infra dans layout. | Debug crash details possible. | Conserver, durcir debug. |
| Driver | `/auth` | `apps/driver-app/app/auth.tsx` | DriverAuthScreen | Connexion ou creation compte chauffeur. | Se connecter / creer compte. | Afficher mot de passe, bascule mode. | Email, password, nom complet. | `signInDriverAccount`, `signUpDriverAccount`. | Non connecte. | Bouton loading. | N/A. | Banner "Connexion refusee". | Resolver auth. | Pas d'OTP ni recuperation mot de passe. | Creation compte envoie vers onboarding; connexion ne verifie pas si profil complet. | Screen capture appelee mais no-op; legal non cliquable. | Conserver, ajouter OTP. |
| Driver | `/onboarding` | `apps/driver-app/app/onboarding.tsx` | DriverOnboardingScreen | Premiere configuration chauffeur. | Envoyer profil. | Choisir vehicule, infos perso, ville, checklist documents. | Phone, permis, vehicule, ville, booleens documents. | `upsertDriverOnboarding`, `restoreDriverSession`. | Nouveau chauffeur a completer. | Bouton submit loading. | N/A. | Status banner erreur. | Message TypeError reseau. | Wizard lisible. | Documents sont des checkboxes, pas des fichiers; duplication avec profil. | `city as any`; promesse revue 24-48h. | Fusionner avec Profil ou transformer en vrai wizard documents. |
| Driver | `/(tabs)/accueil` | `apps/driver-app/app/(tabs)/accueil.tsx` | DriverHomeScreen | Piloter disponibilite et recevoir offres. | Passer en ligne/hors ligne. | Voir offres, ouvrir mission, navigation pickup, config vehicule. | Session, offres, historique, earnings, profil, fatigue, presence GPS. | `fetchDriverOffers`, `fetchMyTrips`, `fetchDriverEarnings`, `fetchDriverProfile`, `updateDriverAvailabilityWithApi`, `useDriverPresence`, `useDriverRealtimeStream`, `DriverHomeMapView`, Google Maps Linking. | Offline, online, validation, offres visibles, mission active, fatigue. | `isRefreshing`, status note, refresh direct. | Aucun offer -> attente. | Status note. | Message reseau; refresh live 2.5s. | Sheet dynamique + modal offer; refresh button visible dans sheet. | Accueil et modal offre dupliquent Offres; auto-open peut surprendre. | Gains du jour, statut validation/fatigue, distance pickup. | Conserver, simplifier. |
| Driver | `/(tabs)/offres` | `apps/driver-app/app/(tabs)/offres.tsx` | OffersScreen | Gerer offres et mission active. | Accepter/refuser ou avancer la mission. | Arrivee pickup, demarrer, terminer, annuler, SOS, incident, timeline, route safety. | Session, offres, historique, trip detail, profil, fatigue, GPS. | `fetchDriverOffers`, `fetchMyTrips`, `fetchDriverProfile`, `fetchTripDetail`, `acceptRideRequestWithApi`, `declineDriverOfferWithApi`, `updateTripStatusWithApi`, `reportTripIncidentWithApi`, `triggerTripSafetySosWithApi`, `useDriverPresence`, `useDriverRealtimeStream`, `ApproachMapView`, `TripMapView`. | Offre reservee, matched, driver arriving, in progress, completed, suspended. | RefreshControl, status, busy locks. | Aucune offre -> attente. | Banners, alerts, recovery start trip. | Retry reseau; mission reste active si detail indispo. | Tres dense; plusieurs modes dans un seul fichier. | Mission critique cachee sous tab "Missions"; pas d'ecran code pickup dedie. | Rider name, route, payout, fairness/confidence scores, paiement. | Conserver, scinder en mission active. |
| Driver | `/(tabs)/revenus` | `apps/driver-app/app/(tabs)/revenus.tsx` | RevenusScreen | Consulter revenus, payout et historique recent. | Lire gains et statut settlement. | Refresh. | Session, earnings, history, profil. | `fetchDriverEarnings`, `fetchMyTrips`, `fetchDriverProfile`. | Revenus du jour/semaine/mois, settlement, ajustements, suspension. | ActivityIndicator et RefreshControl. | Aucune course comptabilisee. | Status text. | Message revenus actualises au retour reseau. | Date prochain virement calculee localement. | Pas de retrait ou demande payout autonome. | Payout rate, frais Orbi, settlement state. | Conserver, ajouter retraits. |
| Driver | `/(tabs)/profil` | `apps/driver-app/app/(tabs)/profil.tsx` | ProfilScreen | Gerer profil, validation, vehicule, documents et support. | Envoyer profil chauffeur. | Preparer justificatifs, voir statuts, support ticket, logout. | Profil, historique, documents, reviews, tickets, formulaire vehicule/docs. | `fetchDriverProfile`, `fetchMyTrips`, `getMySupportTicketsWithApi`, `requestDriverDocumentUploadLinks`, `upsertDriverOnboarding`, `createSupportTicketWithApi`, `signOutDriverAccount`. | Profil pending/verified/suspended, documents pending/approved/rejected, vehicle count. | Refresh live 45s. | Aucun vehicule/document/ticket. | Status banner. | Network fallback via resolver. | Tres long; edition et lecture melangees. | Preparation liens documents sans upload binaire; onboarding duplique. | Contraintes fichier, taille max, expiration lien, statuses techniques. | Deplacer/scinder. |

## Etapes metier attendues Driver

| Etape demandee | Couverture actuelle | Route/fichier | Utilite reelle | Probleme principal | Statut |
|---|---|---|---|---|---|
| Onboarding | Oui | `/onboarding`, `/profil` | Enregistrer chauffeur. | Deux parcours concurrents. | Fusionner. |
| Identite | Partiel | `/auth`, `/onboarding`, `/profil` | Nom, email, telephone, permis. | Pas d'OTP/verification identite mobile. | Simplifier. |
| Documents | Partiel | `/onboarding`, `/profil` | Declarer/presenter docs. | Pas d'upload binaire reel; checkboxes dans onboarding. | Ecran a reconstruire. |
| Vehicule | Oui | `/onboarding`, `/profil` | Ajouter vehicule. | Duplication et champs libres incoherents. | Fusionner. |
| Validation | Oui | `/profil`, `/accueil` | Voir readiness/verif. | Pas de page validation claire avec prochaines actions. | Deplacer. |
| Accueil | Oui | `/accueil` | Mise en ligne et resume. | Offre modale dupliquee avec Offres. | Conserver. |
| Disponibilite | Oui | `/accueil` | Online/offline. | Locked state explique brievement seulement. | Conserver. |
| Offre | Oui | `/accueil`, `/offres` | Voir proposition. | Deux presentations differentes. | Fusionner. |
| Acceptation | Oui | `/offres` | Accepter offre. | Modal accueil redirige seulement; action reelle dans Offres. | Simplifier. |
| Refus | Oui | `/offres`, modal accueil auto-decline timer | Refuser. | Refus automatique au timer depuis modal accueil sans motif visible. | Simplifier. |
| Navigation vers passager | Oui | `/accueil`, `/offres` | Ouvrir Google Maps / approche. | Pas de navigation interne turn-by-turn. | Conserver. |
| Arrivee | Oui | `/offres` | Marquer arrive au point. | Pas d'ecran dedie. | Conserver comme sous-etape. |
| Code | Partiel | `/offres`, API `verifyPickupCodeWithApi` disponible mais non observe dans UI active | Confirmer embarquement. | Pas de saisie code pickup visible dans les ecrans inspectes. | Ecran/sous-etape manquante. |
| Trajet | Oui | `/offres` | Conduire vers destination. | Combine avec liste offres. | Deplacer mission active. |
| Fin | Oui | `/offres` | Terminer course. | Confirmation alert seulement. | Conserver, mieux isoler. |
| Paiement | Partiel | `/offres`, `/revenus` | Voir paiement/gain apres course. | Pas de verification paiement driver dediee. | Deplacer. |
| Revenus | Oui | `/revenus` | Gains et settlement. | Pas de retrait. | Conserver. |
| Portefeuille | Non dedie | `/revenus` settlement seulement | Wallet/payout driver. | Manquant comme surface chauffeur. | Ecran manquant. |
| Retraits | Non dedie | `/revenus` "prochain virement" | Suivre payout. | Aucun flux demande/retrait. | Ecran manquant. |
| Historique | Partiel | `/revenus`, `/offres` history | Voir courses passees. | Pas d'historique mission dedie. | Ecran manquant ou ajouter a Revenus. |
| Support | Oui | `/profil`, `/offres` incidents/SOS | Demandes support. | Disperse. | Fusionner. |
| Documents expires | Partiel | `/profil` documents status/rejection | Voir status docs. | Pas de filtre/alerte expiration dediee. | Ecran manquant. |
| Suspension | Partiel | `/profil`, `/revenus`, `/accueil` | Informer chauffeur. | Pas de parcours appel/support. | Ecran manquant. |
| Profil | Oui | `/profil` | Consulter/editer profil. | Trop charge. | Simplifier. |

## Incoherences et doublons principaux

- `onboarding` et `profil` couvrent tous les deux vehicule, identite et documents.
- `accueil` et `offres` presentent tous les deux les offres, avec une modal countdown cote accueil.
- `offres` melange offres disponibles et mission active; un chauffeur en course devrait avoir une surface mission prioritaire.
- `revenus` affiche settlement/payout mais pas de portefeuille/retrait reel.
- Les documents affichent des contraintes techniques de lien et de taille dans l'UI.
- La suspension est montree en bannieres, pas en parcours de resolution.

## Ecrans manquants Driver

- Verification OTP / telephone.
- Upload documents reel avec camera/fichier.
- Validation chauffeur dediee avec prochaine action.
- Mission active dediee.
- Verification code passager.
- Portefeuille driver.
- Retraits / payouts.
- Historique courses complet.
- Documents expires / renouvellement.
- Suspension / recours / support prioritaire.

## Ecrans inutiles ou a fusionner

- `/onboarding` doit devenir soit le meme moteur que le formulaire profil, soit disparaitre apres creation initiale.
- La modal offre dans `/accueil` doit partager le meme composant/action que `/offres`.
- Les blocs support dans `/profil` et incidents dans `/offres` doivent converger vers un support driver central.
