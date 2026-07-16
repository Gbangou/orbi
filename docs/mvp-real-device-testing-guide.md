# Guide terrain Orbi — test reel sur Android

Ce guide explique comment tester Orbi avec de vrais telephones Android, en
donnees mobiles 4G/5G, pour un pilote serieux.

**Aucun PC n'est requis pendant le test.** Le backend Orbi tourne sur Render
avec une base PostgreSQL distante. Il n'y a pas de tunnel, pas de Docker, pas
de PC a garder allume pendant le test.

## Architecture du pilote terrain

```
Telephone Android (Passager)
       |
       | HTTPS — 4G/5G
       |
       +---> https://orbi-field-api.onrender.com  (Render field API)
       |
Telephone Android (Chauffeur)
```

Le backend est disponible independamment de tout PC local. Sur plan gratuit
Render, un cold start reste possible apres inactivite.

## Comptes de demonstration

Les APK terrain contiennent les identifiants controles directement dans le build.
Un bouton "Acces terrain securise" apparait sur l'ecran de connexion de chaque app.

| Role      | Email                       | Mot de passe    |
| --------- | --------------------------- | --------------- |
| Passager  | testpassager@orbi.test      | TestOrbi2026!   |
| Chauffeur | testchauffeur@orbi.test     | TestOrbi2026!   |

Les testeurs peuvent aussi creer leurs propres comptes. Les comptes chauffeurs
doivent etre valides dans l'admin, sauf si un flag de pilote ferme active
explicitement l'auto-onboarding.

## 1. Verifier que le backend est operationnel

Avant tout test, verifier depuis un navigateur ou PowerShell:

```
https://orbi-field-api.onrender.com/api/v1/health/ready
```

La reponse doit etre:

```json
{"status":"ready", ...}
```

Depuis PowerShell si necessaire:

```powershell
Invoke-WebRequest -Uri "https://orbi-field-api.onrender.com/api/v1/health/ready" -UseBasicParsing
```

Code attendu: `200`. Si le backend ne repond pas, verifier Render →
`orbi-field-api` → Logs et Environment.

## 2. Construire les APK

Build local recommande depuis la racine du projet:

```powershell
pnpm mobile:apk
```

Les APKs sont produits dans `dist/`. Par defaut, le build local pointe vers
l'API LAN du PC (`http://<ip-du-pc>:3000`) pour que le telephone, l'admin local
et la base locale utilisent les memes donnees.

Pour un APK connecte au backend Render, utiliser les scripts explicites:

```powershell
pnpm mobile:apk:rider:field
pnpm mobile:apk:driver:field
```

Ne pas melanger les deux modes pendant un test:

- APK LAN local: comptes visibles dans la base locale `localhost:5433` et dans
  l'admin local.
- APK Render: comptes visibles uniquement dans la base Render/Neon associee au
  service `https://orbi-field-api.onrender.com`.

Option EAS si le poste local n'est pas disponible:

```powershell
pnpm mobile:field --ApiUrl https://orbi-field-api.onrender.com --App rider --Profile mvp
```

```powershell
pnpm mobile:field --ApiUrl https://orbi-field-api.onrender.com --App driver --Profile mvp
```

EAS Cloud compile le build. Suivre la progression:

```
https://expo.dev/accounts/gbangou/projects
```

Quand le build est pret, EAS affiche un lien de telechargement et un QR code.

## 3. Installer l'APK Passager

Sur le telephone passager:

1. Couper le Wi-Fi.
2. Activer les donnees mobiles.
3. Ouvrir Chrome.
4. Aller sur le tableau de bord EAS:

```
https://expo.dev/accounts/gbangou/projects/orbi-passager
```

5. Appuyer sur le dernier build `mvp`.
6. Appuyer sur `Install` ou scanner le QR code.
7. Telecharger le fichier `.apk`.
8. Ouvrir le fichier.
9. Si Android bloque: `Parametres` → `Installer applis inconnues` → `Chrome` →
   `Autoriser depuis cette source`.
10. Appuyer sur `Installer`.
11. Appuyer sur `Ouvrir`.

Verifier que l'icone Orbi Passager apparait sur le telephone.

## 4. Installer l'APK Chauffeur

Sur le telephone chauffeur:

1. Couper le Wi-Fi.
2. Activer les donnees mobiles.
3. Ouvrir Chrome.
4. Aller sur:

```
https://expo.dev/accounts/gbangou/projects/orbi-chauffeur
```

5. Appuyer sur le dernier build `mvp`.
6. Appuyer sur `Install` ou scanner le QR code.
7. Suivre les memes etapes d'installation que pour le passager.

Verifier que l'icone Orbi Chauffeur apparait sur le telephone.

## 5. Methodes de paiement

L'app propose:

- **Mobile Money** (Orange Money, Moov Money) — affiche en priorite dans l'interface.
- **Cash** — disponible en secours.

Pour le pilote terrain, utiliser **cash uniquement**. Les transactions Mobile
Money ne sont pas encore connectees aux operateurs, mais l'interface est presente
pour la presentation aux investisseurs.

## 6. Scenario terrain: une course complete

Ce scenario couvre la totalite du cycle de vie d'une course. Faire ce test en
premier pour valider que tout fonctionne.

### Preparation

- Telephone 1: Orbi Passager, donnees mobiles, Wi-Fi coupe.
- Telephone 2: Orbi Chauffeur, donnees mobiles, Wi-Fi coupe.
- Les deux personnes peuvent etre au meme endroit pour un premier test.

### Etape 1 — Connexion chauffeur

1. Ouvrir `Orbi Chauffeur`.
2. Appuyer sur `Acces terrain securise` ou entrer `testchauffeur@orbi.test` /
   `TestOrbi2026!`.
3. Sur l'ecran accueil, verifier que la carte affiche le statut.
4. Passer `En ligne` (disponible).

Si un message demande de configurer un vehicule, appuyer sur `Configurer` et
suivre les etapes d'onboarding (automatiquement approuve).

### Etape 2 — Connexion passager

1. Ouvrir `Orbi Passager`.
2. Appuyer sur `Acces terrain securise` ou entrer `testpassager@orbi.test` /
   `TestOrbi2026!`.
3. Sur l'ecran accueil, verifier que la carte s'affiche.

### Etape 3 — Demande de course

1. Sur le telephone passager:
   - Appuyer sur `Reserver`.
   - Saisir un point de depart (ex: Rond-point de la Nation, Ouagadougou).
   - Saisir une destination (ex: Aeroport de Ouagadougou).
   - Selectionner l'option Moto ou standard.
   - Choisir le mode de paiement: `Cash`.
   - Appuyer sur `Confirmer la demande`.
2. L'app passager passe en mode attente de chauffeur.

### Etape 4 — Acceptation de l'offre (chauffeur)

1. Sur le telephone chauffeur, une offre apparait dans l'onglet `Offres`.
2. Appuyer sur l'offre pour voir les details.
3. Appuyer sur `Accepter l'offre`.
4. L'app chauffeur passe en mode course active.
5. Sur le telephone passager, le statut change: le chauffeur est en route.

### Etape 5 — Arrivee au pickup

1. Sur le telephone chauffeur:
   - Appuyer sur `Je suis arrive` (DRIVER_ARRIVING).
2. Sur le telephone passager:
   - L'ecran Activite affiche: **"Code a donner au chauffeur: XXXX"** (code
     a 4 chiffres).
   - Communiquer ce code au chauffeur.

### Etape 6 — Demarrage de la course

1. Sur le telephone chauffeur:
   - Saisir le code a 4 chiffres reçu du passager.
   - Appuyer sur `Verifier le code et demarrer` (IN_PROGRESS).
2. La course est maintenant en cours.

Le chauffeur ne voit pas le code dans son application. Le demarrage direct sans
verification est bloque par le backend; seul le code affiche cote passager peut
ouvrir le trajet. Si l'API est indisponible, les apps doivent afficher un etat
vide ou une erreur reseau, pas des offres ou options fictives.

### Etape 7 — Fin de course

1. Sur le telephone chauffeur:
   - Appuyer sur `Terminer la course` (COMPLETED).
2. Sur le telephone passager:
   - L'ecran affiche le recapitulatif de la course avec le montant en XOF.
   - Le passager regle en cash.

### Statuts successifs

```
REQUESTED → MATCHED → DRIVER_ARRIVING → IN_PROGRESS → COMPLETED
```

Chaque transition est confirmee par les deux telephones en temps reel via le
flux SSE.

## 7. Verification GPS (chauffeur)

L'app chauffeur utilise le GPS du telephone pour enregistrer la position pendant
la course. Cela alimente le suivi de trajet.

- Autoriser la localisation en arriere-plan lors de la premiere ouverture.
- En exterieur avec une bonne reception GPS, le suivi fonctionne automatiquement.
- L'app affiche un avertissement GPS si le signal est faible, mais ne bloque
  pas la fin de course.

## 8. Tests supplementaires a faire pendant le pilote

### Test A: creation de compte reel

- Passer sur l'ecran `Creer un compte`.
- Creer un compte passager avec email reel.
- Creer un compte chauffeur avec email reel.
- Verifier que le chauffeur est approuve automatiquement.

### Test B: cycle disponibilite

- Chauffeur passe disponible.
- Chauffeur passe indisponible.
- Chauffeur repasse disponible.
- Verifier que l'app ne plante pas.

### Test C: course complete x3

- Faire trois courses successives avec des departs et destinations differents.
- Alterner cash a chaque fois.

### Test D: refus d'offre

- Passager cree une demande.
- Chauffeur refuse l'offre.
- Verifier le comportement de l'app passager.

### Test E: annulation passager

- Passager cree une demande.
- Passager annule avant acceptation.
- Verifier que l'app chauffeur ne plante pas.

### Test F: reseau instable

- Passer dans une zone de faible couverture.
- Mettre le telephone en veille puis le rouvrir.
- Verifier que le statut se resynchronise.

### Test G: presentation investisseurs

- Montrer l'interface Mobile Money (Orange Money, Moov Money).
- Selectionner Mobile Money sur l'ecran de paiement.
- Montrer l'interface complete avant de switcher sur cash pour finaliser.

## 9. Tableau de suivi terrain

Remplir une ligne par test.

| Heure | Testeur | Role      | Telephone    | Reseau    | Action          | Resultat | Bug | Capture |
| ----- | ------- | --------- | ------------ | --------- | --------------- | -------- | --- | ------- |
| 09:10 | Awa     | Passager  | Samsung A12  | Orange 4G | Connexion       | OK       | Non | Oui     |
| 09:15 | Issa    | Chauffeur | Tecno Spark  | Moov 4G   | Disponible      | OK       | Non | Oui     |
| 09:20 | Awa+Issa| Course    | 2 telephones | Data 4G   | Course complete | OK       | Non | Oui     |

## 10. Que faire si ca ne marche pas

### Le backend ne repond pas

Verifier depuis un navigateur:

```
https://orbi-field-api.onrender.com/api/v1/health/ready
```

Si la page ne charge pas, attendre 60 secondes et reessayer. Sur Render gratuit,
un cold start peut arriver apres inactivite. Si le probleme persiste plus de
5 minutes, verifier le dashboard Render `orbi-field-api`.

### L'app affiche "erreur reseau"

1. Verifier que les donnees mobiles sont actives (Wi-Fi coupe).
2. Verifier que le backend repond (voir ci-dessus).
3. Fermer et rouvrir l'app.
4. Si le probleme persiste, desinstaller et reinstaller l'APK.

### Le chauffeur ne recoit pas l'offre

1. Verifier que le chauffeur est bien `En ligne`.
2. Verifier que le passager a confirme la demande.
3. Attendre 10 secondes — le flux SSE se reconnecte automatiquement.
4. Si aucune offre apres 30 secondes, le passager peut annuler et reessayer.

### Le code pickup ne s'affiche pas

Le code apparait dans l'onglet `Activite` du passager, sous la section "Course
en cours". Si l'onglet n'affiche rien, revenir a l'ecran principal et retourner
sur Activite.

### Android bloque l'installation de l'APK

1. `Parametres` du telephone.
2. `Applications` → `Chrome` (ou le navigateur utilise).
3. `Installer des applis inconnues` → Activer.
4. Revenir au fichier APK et installer.

### Le chauffeur n'a pas de vehicule apres inscription

Le pilote serieux doit passer par la validation chauffeur admin. Si le vehicule
n'apparait pas:
1. Verifier dans l'admin que le profil chauffeur est valide.
2. Verifier que le vehicule a ete cree ou rattache au chauffeur.
3. Deconnecter et reconnecter le compte chauffeur.

## 11. Checklist avant de donner les APK aux testeurs

- [ ] Backend repond `200` sur `/api/v1/health/ready`.
- [ ] APK Passager `dist/orbi-rider-mvp.apk` genere ou build EAS telecharge.
- [ ] APK Chauffeur `dist/orbi-driver-mvp.apk` genere ou build EAS telecharge.
- [ ] Test de connexion demo OK sur les deux telephones.
- [ ] Un test de course complete realise avant de distribuer.
- [ ] Wi-Fi coupe sur tous les telephones de test.
- [ ] Donnees mobiles actives.
- [ ] Une personne operations suit le test et note les incidents.

## 12. Message a envoyer aux testeurs

```
Bonjour,

Voici la version test terrain de Orbi — application de transport Ouagadougou.

INSTALLATION:
- Ouvrir le lien ci-dessous depuis Chrome sur votre telephone Android.
- Telecharger et installer le fichier APK.
- Si Android demande une autorisation, accepter dans Parametres.

CONNEXION:
- Utiliser le bouton "Acces terrain securise" sur l'ecran de connexion.
- Ou creer votre propre compte.

TEST:
- Tester UNIQUEMENT avec les donnees mobiles (Wi-Fi coupe).
- Ne pas faire de paiements reels.

BUGS:
- Si vous voyez un bug, envoyer une capture d'ecran avec l'heure et l'action.
- Contacter l'equipe Orbi immediatement si l'app bloque.

Merci pour votre participation au pilote.
```

Ajouter le lien EAS du build correspondant au role du testeur.

## 13. Commandes de build (reference)

Depuis la racine du projet `C:\Users\LENOVO\Desktop\orbi`:

```powershell
# Build local des deux apps en meme temps
pnpm mobile:apk

# Build local passager uniquement
pnpm mobile:apk:rider

# Build local chauffeur uniquement
pnpm mobile:apk:driver

# Option EAS passager
pnpm mobile:field --ApiUrl https://orbi-field-api.onrender.com --App rider --Profile mvp

# Option EAS chauffeur
pnpm mobile:field --ApiUrl https://orbi-field-api.onrender.com --App driver --Profile mvp
```

Prerequis EAS seulement:
- `npm install -g eas-cli` (une seule fois)
- `eas login` avec le compte Expo (une seule fois)
- Verifier le quota Expo/EAS disponible avant de lancer un build cloud

Suivi des builds:

```
https://expo.dev/accounts/gbangou/projects
```
