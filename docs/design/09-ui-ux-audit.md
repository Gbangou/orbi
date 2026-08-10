# Orbi - Audit UI/UX Rider et Driver

Date d'audit: 2026-08-10  
Role d'analyse: Lead Product Designer, plateformes de mobilite  
Portee inspectee: `apps/rider-app`, `apps/driver-app`, composants mobiles partages locaux, navigation Expo, cartes, textes, etats d'erreur/chargement.  
Regle: audit uniquement, aucune modification du code applicatif.

## Synthese Produit

Orbi a deja une base produit credible: les ecrans principaux utilisent la carte comme scene, les parcours Rider/Driver ont des CTA metier, les erreurs sont souvent traduites, et plusieurs donnees sensibles sont masquees. Ce qui donne encore une impression de prototype ou de dashboard technique vient surtout de quatre patterns:

1. Trop d'informations simultanees dans les memes surfaces: statut, paiement, support, progression, carte, metrics, badges et actions coexistent sans priorite claire.
2. Un vocabulaire d'exploitation visible: `jour`, `Statut`, `Journal de course`, `Position`, `Compte valide`, `Mission pret`, references, et messages de synchronisation.
3. Des donnees techniques exposees ou proches de l'utilisateur: coordonnees GPS editables, references de paiement/recu, statuts enum transformes partiellement, categories internes de support.
4. Une coherence visuelle fragile: beaucoup de cards, badges, pills, boutons secondaires, tons `teal/amber/sky/danger`, et styles locaux par ecran, ce qui rend l'app plus lourde qu'une app de mobilite grand public.

Verdict design: pret pour tests internes, trop dense et trop operationnel pour une beta publique. Le Rider doit devenir une app de trajet simple et rassurante. Le Driver doit devenir un poste de conduite clair, pas un tableau d'exploitation.

## Matrice Par Ecran

| Application | Ecran | Fichier | Hierarchie / action principale | Densite | Navigation | Lisibilite / coherence | Etats / accessibilite / reseau |
|---|---|---|---|---|---|---|---|
| Rider | Lancement | `apps/rider-app/app/index.tsx` | Redirection session | faible | simple | coherent | depend restauration session |
| Rider | Auth | `apps/rider-app/app/auth.tsx` | Se connecter | moyenne | simple | correct | erreurs masquees, clavier a surveiller |
| Rider | Accueil | `apps/rider-app/app/(tabs)/home.tsx` | Choisir destination | moyenne | bonne carte + sheet | assez coherent | offline visible, mais "Recherche/dispo proche" technique |
| Rider | Reservation | `apps/rider-app/app/book.tsx` | Confirmer course | tres forte | scroll long | trop de decisions dans un seul ecran | reseau lent gere par status, mais status envahissant |
| Rider | Activite active | `apps/rider-app/app/(tabs)/activity.tsx` | Suivre course / securite | tres forte | sheet active | cockpit de suivi, beaucoup de cards/actions | "jour", status overlay, timeline/receipts trop techniques |
| Rider | Historique | `apps/rider-app/app/(tabs)/activity.tsx` | Revoir trajets | forte | ok | support + stats + recu melanges | references paiement visibles |
| Rider | Trajets | `apps/rider-app/app/(tabs)/trips.tsx` | Historique trajets | moyenne | redondant avec Activite | doublon produit | etats vides corrects mais navigation confuse |
| Rider | Recu | `apps/rider-app/app/receipt.tsx` | Comprendre paiement | forte | scroll actions | trop d'actions de fin, reference visible | fallback/demo visible dans fichier |
| Rider | Notation | `apps/rider-app/app/rating.tsx` | Noter course | faible | simple | un des ecrans les plus clairs | bon etat done/error |
| Rider | Compte | `apps/rider-app/app/(tabs)/account.tsx` | Gerer compte | tres forte | long scroll | compte + wallet + contacts + lieux + support + langue | coordonnees editables et categories internes |
| Driver | Lancement | `apps/driver-app/app/index.tsx` | Redirection session | faible | simple | coherent | depend restauration session |
| Driver | Auth | `apps/driver-app/app/auth.tsx` | Se connecter | moyenne | simple | correct | erreurs masquees |
| Driver | Onboarding | `apps/driver-app/app/onboarding.tsx` | Soumettre profil | forte | wizard | utile mais formulaire dense | claviers multiples, documents simules par check |
| Driver | Accueil | `apps/driver-app/app/(tabs)/accueil.tsx` | Passer en ligne | moyenne | bonne carte + sheet | prometteur, proche app mobilite | statusNote operationnel visible |
| Driver | Offres/Missions | `apps/driver-app/app/(tabs)/offres.tsx` | Accepter/gerer mission | tres forte | long scroll | ressemble a console ops: mission, journal, checks, route, paiement | demarrage/status/realtime visibles |
| Driver | Revenus | `apps/driver-app/app/(tabs)/revenus.tsx` | Comprendre gains | forte | scroll | assez clair mais tres analytique | "Cap", settlement, frais, statut peuvent surcharger |
| Driver | Profil | `apps/driver-app/app/(tabs)/profil.tsx` | Profil + validation | tres forte | long scroll | melange admin validation et self-service | enums city/tier visibles, contraintes upload techniques |

## Signaux Techniques Explicitement Detectes

| Type demande | Detection | Fichier(s) | Impact |
|---|---|---|---|
| JSON | `JSON.parse`, `JSON.stringify` dans WebViews carte | `apps/rider-app/lib/*map*.tsx`, `apps/driver-app/lib/*map*.tsx` | interne, pas forcement visible, mais fragile si erreur WebView remonte |
| Identifiants | `trip.id`, `req.id`, `place.id`, `vehicle.id`, `review.id` utilises en UI/timeline/actions | Rider/Driver activity, account, profil, offres | souvent interne; attention aux references affichees |
| Enums | `ONLINE`, `OFFLINE`, `BUSY`, `SUSPENDED`, `MATCHED`, `IN_PROGRESS`, `MOTORCYCLE`, `CAR`, `OUAGADOUGOU` | multiples ecrans | partiellement traduits; certains libelles restent operateur |
| Coordonnees GPS brutes | champs latitude/longitude editables dans lieux favoris; selection carte nommee avec lat/lng | `apps/rider-app/app/(tabs)/account.tsx`, `apps/rider-app/app/book.tsx` | donne une impression outil interne |
| Statuts socket/realtime | `jour`, `describeRealtimeConnection`, dots live | home/activity/book, accueil/offres/profil | signal technique non comprehensible pour public |
| Version API | `orbiRuntimeConfig.apiVersion` dans auth client | `apps/*/lib/auth.ts` | pas expose directement dans UI observee |
| References paiement | `transactionRef`, reference recu derivee de `trip.id`, provider labels | `book.tsx`, `receipt.tsx`, `activity.tsx` | utile support, mais trop visible pour recu grand public |
| Noms de variables | categories `payment/trip/account/driver/safety/other`, tiers remplaces par `_` | account/profil/onboarding | fuite de modele interne dans l'UX |
| Reponses backend | `feedback.message` remonte via banners | toutes surfaces | globalement filtre, mais depend de `resolve*AppError` |
| Health checks/outils internes | non visibles dans mobile inspecte | n/a | plutot admin/backend |
| Codes d'erreur non traduits | filtrage present dans `session-feedback`, mais certains labels accessibilite/test restent anglais (`call-driver`, `activity-refresh`) | activity/offres | mineur pour visuel, a nettoyer |

## Tableau Des Problemes

| ID | Application | Ecran | Fichier | Probleme | Impact utilisateur | Correction |
|---|---|---|---|---|---|---|
| UX-001 | Rider | Accueil | `apps/rider-app/app/(tabs)/home.tsx` | Badge "Recherche" / "dispo proches" et dot live dans la top bar | L'accueil parait branché sur un systeme de dispatch plutot que centre sur la destination | Remplacer par un seul message humain: "Ou allez-vous ?" et deplacer disponibilite dans le sheet |
| UX-002 | Rider | Accueil | `apps/rider-app/app/(tabs)/home.tsx` | SOS toujours visible meme sans trajet actif | Peut creer anxiete et confusion; action principale concurrence la reservation | Afficher SOS permanent seulement en trajet; hors trajet, placer "Aide" dans Compte/Activite |
| UX-003 | Rider | Accueil | `apps/rider-app/app/(tabs)/home.tsx` | Bottom sheet avec recherche, quick actions et suggestions | Bonne base, mais les suggestions et actions rapides tirent l'oeil hors CTA destination | Faire du champ destination le CTA unique; suggestions en liste compacte sous le champ |
| UX-004 | Rider | Reservation | `apps/rider-app/app/book.tsx` | Ecran de reservation tres long: carte, route, favoris, promo, paiement, estimation, statut, confirmation | Charge cognitive elevee au moment ou l'utilisateur veut juste reserver | Decouper en 3 moments: destination, choix course, paiement/confirmation |
| UX-005 | Rider | Reservation | `apps/rider-app/app/book.tsx` | Destination choisie sur carte peut devenir une adresse latitude/longitude | Aspect prototype et faible confiance | Toujours reverse-geocoder en nom lisible; si inconnu, afficher "Point sur la carte" sans coordonnees |
| UX-006 | Rider | Reservation | `apps/rider-app/app/book.tsx` | Messages realtime injectes dans `status` via `describeRealtimeConnection` | L'utilisateur voit un etat de synchronisation plutot qu'un etat de course | Garder la synchro silencieuse; afficher seulement les changements metier |
| UX-007 | Rider | Reservation | `apps/rider-app/app/book.tsx` | Preview paiement expose provider, transactionRef et reseaux supportes | Le paiement semble technique et fragile | Afficher "Confirmez sur votre telephone" et garder reference dans details masques |
| UX-008 | Rider | Reservation | `apps/rider-app/app/book.tsx` | Le CTA final doit gerer cash/mobile money/wallet, promo, idempotence et disponibilite chauffeur | Risque d'erreur utilisateur et de formulaire trop dense sur petit ecran | Un CTA dynamique avec recap minimal: prix, moyen, bouton; details dans bottom sheet secondaire |
| UX-009 | Rider | Activite active | `apps/rider-app/app/(tabs)/activity.tsx` | L'ecran actif affiche carte, stage tracker, status pill, panel prix/paiement, ETA, chauffeur, checklist, route, actions | Trop proche d'un cockpit; le passager doit savoir "quoi faire maintenant" | Prioriser 1 instruction, 1 carte, 1 carte chauffeur, 2 actions max visibles |
| UX-010 | Rider | Activite active | `apps/rider-app/app/(tabs)/activity.tsx` | Texte `jour` visible pendant sync | Terme incomplet, sensation debug | Remplacer par rien ou "Mise a jour..." uniquement si attente longue |
| UX-011 | Rider | Activite active | `apps/rider-app/app/(tabs)/activity.tsx` | Boutons "Partager", "SOS", "Aide", "Annuler", "Terminer ici" proches | Risque de mauvais tap dans moment stressant | Grouper securite en un bouton persistent; annulation/terminer dans action destructive confirmee |
| UX-012 | Rider | Activite historique | `apps/rider-app/app/(tabs)/activity.tsx` | Historique + support rapide + stats + pending requests sur le meme ecran | La page "Activite" devient un mini dashboard | Separer "Historique" et "Aide"; garder stats uniquement si elles servent une decision |
| UX-013 | Rider | Historique | `apps/rider-app/app/(tabs)/activity.tsx` | Recu affiche statut/provider/reference dans la ligne trajet | Apparence comptable/technique | Afficher "Recu disponible" puis details dans recu complet |
| UX-014 | Rider | Trajets | `apps/rider-app/app/(tabs)/trips.tsx` | Ecran redondant avec Activite recentTrips | Navigation incoherente: utilisateur ne sait pas ou retrouver une course | Fusionner Trajets dans Activite ou renommer Activite en "Aide" si Trajets reste |
| UX-015 | Rider | Recu | `apps/rider-app/app/receipt.tsx` | Reference affichee a partir de `trip.id.slice(...)` | Ressemble a un identifiant interne, pas a un recu client | Masquer sous "Details du paiement"; generer une reference courte metier |
| UX-016 | Rider | Recu | `apps/rider-app/app/receipt.tsx` | Trop d'actions finales: partager, payer, evaluer, refaire, signaler, retour | Fin de parcours surchargee | Garder action principale selon etat: payer ou evaluer; autres actions dans menu |
| UX-017 | Rider | Recu | `apps/rider-app/app/receipt.tsx` | Donnees fallback/demo presentes dans le fichier receipt | Risque de contenu factice en environnement non prevu | Isoler fixtures hors ecran et indiquer clairement mode demo si utilise |
| UX-018 | Rider | Notation | `apps/rider-app/app/rating.tsx` | Bon ecran mais commentaire et boutons peuvent etre bas sur clavier | Sur petits ecrans, clavier peut cacher CTA | S'assurer d'un KeyboardAvoidingView et CTA sticky |
| UX-019 | Rider | Compte | `apps/rider-app/app/(tabs)/account.tsx` | Compte regroupe profil, wallet, top-up, contacts, lieux, support, langue | Ecran trop complique, proche back-office personnel | Diviser en Compte, Paiement, Securite, Lieux; ou utiliser sections repliables |
| UX-020 | Rider | Compte / Lieux | `apps/rider-app/app/(tabs)/account.tsx` | Champs latitude/longitude editables par l'utilisateur | Fort signal outil interne/prototype | Remplacer par carte + adresse; coordonnees jamais visibles par defaut |
| UX-021 | Rider | Compte / Support | `apps/rider-app/app/(tabs)/account.tsx` | Categories support codees `payment/trip/account/driver/safety/other` mappees dans l'UI | L'utilisateur choisit une taxonomie interne | Utiliser questions simples: "Paiement", "Course", "Objet perdu", "Securite", "Compte" |
| UX-022 | Rider | Compte | `apps/rider-app/app/(tabs)/account.tsx` | Bouton header affiche litteralement `refresh` | Texte anglais/debug visible | Remplacer par icone seule avec accessibilite "Actualiser" |
| UX-023 | Rider | Navigation tabs | `apps/rider-app/app/(tabs)/_layout.tsx` | Onglets Accueil, Activite, Trajets, Compte avec Activite/Trajets redondants | Navigation mentale floue | Garder 3-4 onglets: Accueil, Trajets, Paiement, Compte/Aide |
| UX-024 | Rider | Cartes | `apps/rider-app/lib/home-map-view.tsx`, `trip-map-view.tsx` | WebView carte custom avec fallback et messages techniques potentiels | Si erreur, experience fragile et possiblement technique | Prevoir etat carte indisponible humain + CTA "Continuer sans carte" |
| UX-025 | Driver | Onboarding | `apps/driver-app/app/onboarding.tsx` | Step 1 utilise badges `82%`, `MM`, `Safe` | Donne un cote pitch/demo plus que procedure professionnelle | Transformer en benefices calmes et preuves: "Commission claire", "Paiement Mobile Money" |
| UX-026 | Driver | Onboarding | `apps/driver-app/app/onboarding.tsx` | Step documents demande seulement confirmation de disponibilite | Peut sembler simulation, pas vrai onboarding | Clarifier "Etape suivante: televersement" ou integrer upload reel |
| UX-027 | Driver | Onboarding | `apps/driver-app/app/onboarding.tsx` | Longues grilles chips marques/modeles/annees | Sur petit ecran, formulaire dense et long | Utiliser recherche/selecteurs progressifs; CTA sticky |
| UX-028 | Driver | Accueil | `apps/driver-app/app/(tabs)/accueil.tsx` | Bon modele carte + gros toggle, mais statusNote operationnel affiche | Le chauffeur lit des infos de sync/systeme au lieu d'une consigne | Montrer uniquement "Vous etes en ligne" / "En attente de course"; logs invisibles |
| UX-029 | Driver | Accueil | `apps/driver-app/app/(tabs)/accueil.tsx` | Bottom sheet hauteur fixe selon etat | Risque de coupure/overlap sur petits ecrans ou textes longs | Sheet responsive avec snap points et contenu priorise |
| UX-030 | Driver | Accueil | `apps/driver-app/app/(tabs)/accueil.tsx` | "Profil en validation", "Compte pas prêt" cohabitent avec toggle en ligne | Ambiguite: l'action semble possible mais inutile | Si compte non eligible, remplacer toggle par checklist de validation |
| UX-031 | Driver | Offres | `apps/driver-app/app/(tabs)/offres.tsx` | Header montre dot online, spinner realtime, refresh, puis status notices | Aspect dashboard technique | Simplifier header: "Missions" + etat humain, refresh en pull-to-refresh |
| UX-032 | Driver | Offres active | `apps/driver-app/app/(tabs)/offres.tsx` | Active mission affiche carte, tracker, status pill, ETA, distance, paiement, route, rider card, actions, journal | Trop dense pendant conduite | Mode conduite: grande prochaine action, navigation, appel, SOS; details dans tiroir |
| UX-033 | Driver | Offres active | `apps/driver-app/app/(tabs)/offres.tsx` | `Journal de course` accessible en mission | Fonction ops/debug visible au chauffeur | Deplacer dans Support/Admin, ou masquer sous "Details" apres course |
| UX-034 | Driver | Offres active | `apps/driver-app/app/(tabs)/offres.tsx` | Boutons Appeler, SOS securite, Signaler incident, Annuler/Terminer proches | Risque d'erreur en conduite | Grossir action principale; regrouper secondaires dans barre securite |
| UX-035 | Driver | Offres empty | `apps/driver-app/app/(tabs)/offres.tsx` | Etat vide liste Position/Compte/Mission avec valeurs Actif/Valide/Pret | Semble checklist technique | Traduire en "Tout est pret, nous cherchons une course" |
| UX-036 | Driver | Offres | `apps/driver-app/app/(tabs)/offres.tsx` | Libelles "Mise a jour", "offres expirees", "Actualisation..." nombreux | Sensation flux temps reel instable | Garder seulement les evenements actionnables |
| UX-037 | Driver | Revenus | `apps/driver-app/app/(tabs)/revenus.tsx` | `Cap du jour`, progress percent, settlement, frais, part chauffeur, net recent | Interface analytique proche dashboard financier | Prioriser "Aujourd'hui", "A recevoir", "Dernieres courses"; details en onglet |
| UX-038 | Driver | Revenus | `apps/driver-app/app/(tabs)/revenus.tsx` | Statut et flow.primaryStatusLabel dans hero revenus | Melange disponibilite operationnelle et revenus | Retirer statut mission de la page revenus sauf bloc d'alerte |
| UX-039 | Driver | Profil | `apps/driver-app/app/(tabs)/profil.tsx` | Profil expose verification, statut, pourcentage, checklist, notes, formulaires, documents, vehicules | Ressemble a console admin onboarding | Faire un hub "Mon compte chauffeur" avec etat validation resumee et actions par priorite |
| UX-040 | Driver | Profil | `apps/driver-app/app/(tabs)/profil.tsx` | Enums ville/service affiches par remplacement `_` | Libelles peu humains (`BOBO_DIOULASSO`, tiers techniques possibles) | Mapper tous les enums vers libelles produit |
| UX-041 | Driver | Profil documents | `apps/driver-app/app/(tabs)/profil.tsx` | Hints upload: expiration, limite bytes, extensions | Detail technique non utile pour chauffeur | Afficher "Photo/PDF accepte, taille max" en langage simple; details seulement erreur |
| UX-042 | Driver | Profil | `apps/driver-app/app/(tabs)/profil.tsx` | Formulaire complet deploye dans page profil | Petit ecran/clavier: tres lourd et fatigant | Utiliser sous-ecrans dedies: Vehicule, Documents, Zone, Support |
| UX-043 | Driver | Navigation tabs | `apps/driver-app/app/(tabs)/_layout.tsx` | Accueil + Missions se chevauchent quand une mission active existe | Le chauffeur peut ne pas savoir ou agir | Une mission active doit remplacer/ouvrir automatiquement le mode conduite unique |
| UX-044 | Driver | Cartes | `apps/driver-app/lib/driver-home-map-view.tsx`, `approach-map-view.tsx`, `trip-map-view.tsx` | WebViews custom manipulent JSON et coordonnees | Risque de blank map ou erreurs techniques en reseau lent | Etat degrade: liste texte de destination + bouton navigation externe |
| UX-045 | Rider/Driver | Tous ecrans | `apps/*/lib/realtime-widgets.tsx` | Composants live standardisent pills/banners/cards, mais leur usage repete rend l'app operationnelle | Trop de badges et notices affaiblissent la hierarchie | Definir regles: un seul badge live max par ecran, jamais de jargon sync |
| UX-046 | Rider/Driver | Tous ecrans | `apps/*/app/_layout.tsx` | Crash details activables via env `EXPO_PUBLIC_DEBUG_CRASH_DETAILS` | Risque d'exposer details techniques si active en build publique | Verrouiller off en prod et afficher message support humain |
| UX-047 | Rider/Driver | Tous ecrans | multiples | Beaucoup de commentaires/styles locaux et composants inline | Coherence visuelle difficile a maintenir | Centraliser primitives: screen, sheet, action bar, map state, status copy |
| UX-048 | Rider/Driver | Tous ecrans | multiples | Couleurs `teal/amber/sky/danger` utilisees pour statut, action, audience et alerte | Le sens de couleur devient ambigu | Systeme couleur: primaire, alerte, danger, info; un sens par couleur |
| UX-049 | Rider/Driver | Tous ecrans | multiples | Loaders parfois dans header, parfois banner, parfois bouton | Reseau lent donne une experience instable | Pattern unique: skeleton/inline button loader + message si > 3s |
| UX-050 | Rider/Driver | Tous ecrans | multiples | Accessibilite partielle: certains labels techniques/test (`activity-refresh`, `call-driver`) | Lecteurs d'ecran peuvent entendre du vocabulaire interne | Revoir labels accessibilite comme textes utilisateur |

## Analyse Transversale Par Critere

| Critere | Etat actuel | Risque | Direction cible |
|---|---|---|---|
| Hierarchie visuelle | Les cards et badges ont souvent le meme poids | Action principale diluee | 1 hero/action principale par ecran |
| Action principale | Presente mais concurrencee par support/status/refresh | Hesitation et erreurs | CTA primaire unique, secondaires caches ou regroupes |
| Densite | Forte sur Reservation, Activite, Compte, Offres, Profil | Impression app compliquee | Progressive disclosure et sous-ecrans |
| Navigation | Tabs claires en surface, mais doublons Rider/Driver | Redondance Activite/Trajets, Accueil/Missions | Tabs orientees taches |
| Lisibilite | Bonne typographie globale, mais beaucoup de petits textes 10-12px | Fatigue, surtout conduite | Grandes zones de decision, texte court |
| Couleurs | Palette sobre mais sens des tons fluctuant | Incoherence | Semantique couleur stricte |
| Espacements | Plusieurs ecrans respirent; longs scrolls restent lourds | Petit ecran charge | Sheets snap + sections repliables |
| Boutons | Nombreux, parfois plusieurs dangers visibles | Taps accidentels | Barre action contextuelle |
| Formulaires | Complets mais longs | Clavier, abandon | Formulaires par etape, validation inline |
| Carte | Centrale et immersive | WebView fragile, fallback peu produit | Carte + mode texte degrade |
| Bottom sheets | Bon pattern mobilite | hauteur fixe et contenu dense | Snap points, CTA sticky |
| Loaders | Presents | parfois techniques/header | Skeleton + message humain tardif |
| Erreurs | Souvent filtrees | certains messages backend peuvent passer | Dictionnaire UX des erreurs |
| Etats vides | Presents | parfois checklists techniques | Etats vides emotionnels/actionnables |
| Accessibilite | HitSlop et labels existent | labels techniques, petits textes | Revue a11y systematique |
| Petits ecrans | `numberOfLines` frequents | contenu coupe sans alternative | Reflow, collapse, scroll local |
| Clavier | `keyboardShouldPersistTaps` present | longs formulaires profil/compte | CTA sticky + KeyboardAvoidingView partout |
| Reseau lent | Status/refresh nombreux | impression instabilite | Montrer derniere donnee fiable + retry calme |

## Vision Cible Simple

### Rider

Orbi Rider doit ressembler a une app qui repond a trois questions, dans cet ordre:

1. Ou allez-vous ?
2. Combien ca coute et comment payer ?
3. Que dois-je faire maintenant ?

L'accueil doit etre une carte calme avec un champ destination dominant. La reservation doit etre un flux court: destination, option, paiement. Pendant le trajet, l'ecran doit montrer une instruction principale, le chauffeur, la carte et deux actions de securite maximum. Le compte doit etre un espace de confiance, pas un panneau de configuration.

### Driver

Orbi Driver doit ressembler a un outil de travail en conduite:

1. Suis-je disponible ?
2. Quelle course accepter ?
3. Quelle est ma prochaine action ?
4. Combien ai-je gagne ?

L'accueil doit etre centre sur le gros toggle en ligne/hors ligne. Une mission active doit ouvrir un mode conduite unique avec navigation, prochaine action, appel et securite. Les offres doivent etre des decisions rapides, pas des fiches analytiques. Revenus et profil doivent etre utiles hors conduite, avec beaucoup moins de statut operationnel visible.

## Priorite Design Avant Beta

1. Retirer les coordonnees GPS visibles/editables des surfaces Rider.
2. Supprimer ou renommer tous les signaux realtime/socket visibles (`jour`, sync, statusNote technique).
3. Fusionner ou clarifier les onglets redondants Rider `Activite` / `Trajets`.
4. Transformer Driver `Offres` en mode conduite simplifie quand une mission est active.
5. Reduire `Compte` Rider et `Profil` Driver en hubs avec sous-ecrans.
6. Cacher references paiement/ids sous des details avances.
7. Definir un systeme unique de bottom sheets, banners, empty states et boutons destructifs.
