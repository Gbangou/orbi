# Guide Tres Pratique Pour Lancer Mobilis Sur Ce PC Et Sur Android

Ce document est ecrit pour une personne qui ne connait presque rien en informatique.

Le but est simple:

1. ouvrir le projet
2. lancer Mobilis sur le PC
3. lancer Mobilis sur un telephone Android

Je vais te dire:

- quoi cliquer
- quoi taper
- ce que tu dois voir
- quoi faire si ce n est pas pareil

## 1. Avant De Commencer

Sur ce PC, plusieurs choses sont deja pretes.

Tu n as normalement pas besoin de reinstaller:

- `Node.js`
- `npm`
- `pnpm`
- `Visual Studio Code`

Le projet existe deja ici:

```text
C:\Users\LENOVO\Desktop\mobilis
```

La base locale et Prisma ont deja ete remis en bon etat sur cette machine.

Le seul point qu on ne peut pas verifier depuis ce PC:

- savoir si `Expo Go` est deja installe sur ton telephone Android

## 2. Ce Que Tu Vas Faire Aujourd Hui

Si tu veux seulement utiliser le projet, fais les parties dans cet ordre:

1. Partie A: lancer le projet sur le PC
2. Partie B: ouvrir les pages dans le navigateur
3. Partie C: lancer le projet sur Android

## 3. Partie A. Lancer Le Projet Sur Le PC

Cette partie est la plus importante.
Fais exactement les etapes dans cet ordre.

### Etape 1. Ouvrir Visual Studio Code

Ce que tu fais:

1. Clique sur le bouton `Demarrer` de Windows.
2. Tape `Visual Studio Code`.
3. Clique sur `Visual Studio Code`.

Ce que tu dois voir:

- une grande fenetre avec des menus en haut
- une zone vide ou les derniers projets ouverts

Si tu ne vois pas VS Code:

- recommence la recherche
- ou cherche `Code`

### Etape 2. Ouvrir Le Dossier Du Projet

Ce que tu fais:

1. En haut a gauche, clique sur `File`.
2. Clique sur `Open Folder`.
3. Dans la fenetre qui s ouvre, va dans:

```text
C:\Users\LENOVO\Desktop
```

4. Clique une fois sur le dossier `mobilis`.
5. Clique sur `Select Folder`.

Ce que tu dois voir:

- a gauche, une colonne avec des dossiers comme `apps`, `docs`, `packages`, `scripts`
- en haut, l onglet VS Code doit maintenant etre sur le projet `mobilis`

Si une fenetre demande si tu fais confiance au dossier:

1. clique sur `Yes, I trust the authors`

### Etape 3. Ouvrir Le Terminal Dans VS Code

Le terminal sert a taper les commandes.

Ce que tu fais:

1. En haut, clique sur `Terminal`.
2. Clique sur `New Terminal`.

Ce que tu dois voir:

- en bas, une nouvelle zone noire ou sombre
- une ligne qui finit souvent par quelque chose comme:

```text
PS C:\Users\LENOVO\Desktop\mobilis>
```

Si tu ne vois pas exactement ce chemin:

1. clique dans le terminal
2. tape:

```powershell
cd C:\Users\LENOVO\Desktop\mobilis
```

3. appuie sur `Entree`

Tu dois ensuite voir:

```text
PS C:\Users\LENOVO\Desktop\mobilis>
```

### Etape 4. Verifier Ou Remettre Les Dependances

Cette commande prepare ou remet en etat les bibliotheques du projet.

Ce que tu fais:

1. clique dans le terminal
2. tape:

```powershell
pnpm install
```

3. appuie sur `Entree`

Ce que tu dois voir:

- beaucoup de lignes qui defilent
- a la fin, le terminal redevient libre

Ce que tu attends avant de continuer:

- que le curseur revienne sur une ligne qui commence par `PS`

Si tu vois beaucoup de texte:

- c est normal
- attends juste la fin

### Etape 5. Repreparer Les Fichiers Locaux

Cette commande verifie les fichiers `.env`.

Ce que tu fais:

1. clique dans le terminal
2. tape:

```powershell
pnpm setup:local
```

3. appuie sur `Entree`

Ce que tu dois voir:

- des messages comme `Kept existing ...` ou `Created ...`
- puis un message proche de:

```text
Local environment files are ready.
```

Si tu vois ce message:

- continue

Si tu ne le vois pas:

- lis la derniere ligne rouge
- ne continue pas avant de corriger

### Etape 6. Ouvrir Docker Desktop

La base de donnees a besoin de Docker.

Ce que tu fais:

1. clique sur le bouton `Demarrer` de Windows
2. tape `Docker Desktop`
3. clique sur `Docker Desktop`

Ce que tu dois voir:

- une application Docker qui s ouvre
- au bout d un moment, Docker doit indiquer qu il est bien demarre

Tu peux comprendre que c est bon si:

- l application est ouverte sans message d erreur
- Docker ne montre pas un etat de chargement bloque

Important:

- ne ferme pas Docker Desktop

### Etape 7. Demarrer La Base De Donnees Locale

Ce que tu fais:

1. reviens dans VS Code
2. clique dans le terminal
3. tape:

```powershell
pnpm db:start
```

4. appuie sur `Entree`

Ce que tu dois voir:

- des lignes qui parlent de PostgreSQL ou Docker
- puis un message proche de:

```text
PostgreSQL is ready on localhost:5433
```

Quand tu vois ce message:

- la base est prete
- tu peux continuer

Si tu ne vois pas ce message:

- attends un peu
- si une erreur rouge apparait, arrête-toi ici

### Etape 8. Regenerer Prisma

Ce que tu fais:

1. clique dans le terminal
2. tape:

```powershell
pnpm prisma:generate
```

3. appuie sur `Entree`

Ce que tu dois voir:

- des lignes Prisma
- puis le terminal redevient libre

### Etape 9. Appliquer Les Migrations Prisma

Ce que tu fais:

1. clique dans le terminal
2. tape:

```powershell
pnpm prisma:migrate
```

3. appuie sur `Entree`

Ce que tu dois voir:

- des lignes Prisma
- pas d erreur rouge finale
- puis le terminal redevient libre

### Etape 10. Lancer Le Seed

Le seed cree ou remet les donnees de demonstration.

Ce que tu fais:

1. clique dans le terminal
2. tape:

```powershell
pnpm prisma:seed
```

3. appuie sur `Entree`

Ce que tu dois voir:

- des lignes de preparation
- puis un message qui indique que les donnees de demonstration ont ete creees

Tu peux retenir que c est bon si tu vois un message de fin sans erreur rouge.

### Etape 11. Verifier Que Prisma Est Propre

Cette etape est une verification simple.

Ce que tu fais:

1. en haut, clique sur `Terminal`
2. clique sur `New Terminal`
3. clique dans le nouveau terminal
4. tape:

```powershell
cd C:\Users\LENOVO\Desktop\mobilis\apps\backend
```

5. appuie sur `Entree`
6. tape:

```powershell
.\node_modules\.bin\prisma.CMD migrate status
```

7. appuie sur `Entree`

Ce que tu dois voir:

- un message proche de:

```text
Database schema is up to date!
```

Si tu vois cela:

- Prisma est propre

Si tu ne vois pas cela:

- ne continue pas avec Android
- reviens a la commande precedente et note le message d erreur

### Etape 12. Lancer Toute La Version Web

Cette commande lance:

- le backend
- l admin web
- le rider web

Ce que tu fais:

1. ouvre encore un nouveau terminal:
2. clique sur `Terminal`
3. clique sur `New Terminal`
4. tape:

```powershell
cd C:\Users\LENOVO\Desktop\mobilis
```

5. appuie sur `Entree`
6. tape:

```powershell
pnpm dev:full-web
```

7. appuie sur `Entree`

Ce que tu dois voir:

- beaucoup de lignes qui demarrent
- backend
- admin web
- rider web
- pas de driver web dans cette commande

Tres important:

- `pnpm dev:full-web` ne lance plus que la pile web stable: backend + admin + rider
- le driver web se lance a part avec `pnpm dev:web-driver-preview`
- rider web et driver web ne doivent pas tourner en meme temps dans cette configuration Expo web
- sinon ils se battent pour le port Metro `8081`

- laisse ce terminal ouvert
- ne le ferme pas

## 4. Partie B. Ouvrir Les Pages Dans Le Navigateur

Maintenant, on va verifier que les pages s ouvrent.

### Etape 13. Ouvrir La Documentation API

Ce que tu fais:

1. ouvre ton navigateur internet
2. clique dans la barre d adresse tout en haut
3. tape:

```text
http://localhost:3000/docs
```

4. appuie sur `Entree`

Ce que tu dois voir:

- une page Swagger
- une liste de routes ou sections API

Si la page ne s ouvre pas:

- regarde dans le terminal `pnpm dev:full-web`
- attends encore un peu

### Etape 14. Ouvrir Le Web Admin

Ce que tu fais:

1. ouvre un nouvel onglet
2. clique dans la barre d adresse
3. tape:

```text
http://localhost:3001
```

4. appuie sur `Entree`

Ce que tu dois voir:

- l interface admin Mobilis

### Etape 15. Ouvrir Le Rider Web

Ce que tu fais:

1. ouvre un nouvel onglet
2. clique dans la barre d adresse
3. tape:

```text
http://localhost:8081
```

4. appuie sur `Entree`

Ce que tu dois voir:

- l application rider web

Si `http://localhost:8081` ne marche pas:

1. retourne dans VS Code
2. regarde le terminal qui tourne avec `pnpm dev:full-web`
3. cherche l URL exacte affichee par Expo
4. ouvre cette URL dans le navigateur

### Etape 16. Ouvrir Le Driver Web

Ce que tu fais:

1. retourne dans VS Code
2. arrete `pnpm dev:full-web` avec `Ctrl+C`
3. dans le meme terminal, lance:

```powershell
pnpm dev:web-driver-preview
```

4. repere l URL Expo du driver
5. si elle est cliquable, clique dessus
6. sinon, copie l URL
7. colle-la dans un nouvel onglet du navigateur
8. appuie sur `Entree`

Ce que tu dois voir:

- l application driver web

## 5. Comptes De Demonstration

Quand tout est bien lance, tu peux utiliser ces comptes:

- Admin: `admin@mobilis.app` / `Mobilis123!`
- Rider: `rider@mobilis.app` / `Mobilis123!`
- Driver: `driver@mobilis.app` / `Mobilis123!`

## 6. Partie C. Tester Simplement Les Ecrans Sur Le PC

### Etape 17. Tester Le Rider Web

Ce que tu fais:

1. ouvre le rider web
2. si tu vois un ecran de connexion, entre:

```text
Email: rider@mobilis.app
Mot de passe: Mobilis123!
```

3. clique sur le bouton de connexion
4. ouvre `home`
5. ouvre `book`
6. ouvre `activity`
7. ouvre `voice`

Ce que tu dois voir:

- les pages s ouvrent
- l application ne plante pas

### Etape 18. Tester Le Driver Web

Ce que tu fais:

1. ouvre le driver web
2. si tu vois un ecran de connexion, entre:

```text
Email: driver@mobilis.app
Mot de passe: Mobilis123!
```

3. clique sur le bouton de connexion
4. ouvre `accueil`
5. ouvre `offres`
6. ouvre `revenus`
7. ouvre `profil`

Ce que tu dois voir:

- les pages s ouvrent
- l application ne plante pas

## 7. Partie D. Lancer Android

Pour Android, il y a une idee tres importante:

- sur le PC, `localhost` veut dire le PC
- sur le telephone, `localhost` veut dire le telephone

Donc pour que le telephone parle au backend du PC, il faut remplacer `localhost` par l adresse IP du PC dans les fichiers `.env` des apps mobiles.

## 8. Etape 19. Verifier Si Expo Go Est Installe Sur Le Telephone

Ce que tu fais sur le telephone:

1. prends le telephone Android
2. debloque-le
3. cherche l application `Expo Go`

Si tu trouves `Expo Go`:

- passe a l etape suivante

Si tu ne trouves pas `Expo Go`:

1. ouvre `Play Store`
2. appuie dans la barre de recherche
3. tape `Expo Go`
4. appuie sur `Installer`
5. attends la fin

## 9. Etape 20. Verifier Que Le PC Et Le Telephone Sont Sur Le Meme Wi-Fi

Ce que tu fais:

1. sur le PC, verifie que tu es connecte a ton Wi-Fi normal
2. sur le telephone, ouvre `Parametres`
3. ouvre `Wi-Fi`
4. regarde le nom du reseau
5. verifie que c est le meme reseau que sur le PC

Si ce n est pas le meme:

- connecte le telephone au meme Wi-Fi que le PC

## 10. Etape 21. Trouver L Adresse IP Du PC

Methode conseillee:

1. dans VS Code, ouvre un terminal a la racine du projet
2. tape:

```powershell
pnpm mobile:lan
```

3. appuie sur `Entree`

Ce que cette commande fait:

- elle trouve l IP Wi-Fi du PC
- elle met a jour `apps/rider-app/.env`
- elle met a jour `apps/driver-app/.env`
- elle garde l URL API au format `http://IP_DU_PC:3000`

Si cette commande reussit, tu peux passer directement a l etape 24.

Methode manuelle si tu veux verifier toi-meme:

Ce que tu fais dans VS Code:

1. clique sur `Terminal`
2. clique sur `New Terminal`
3. clique dans le terminal
4. tape:

```powershell
ipconfig
```

5. appuie sur `Entree`

Ce que tu dois voir:

- beaucoup de lignes reseau

Ce que tu cherches:

- la ligne `IPv4 Address`

Exemple:

```text
192.168.1.15
```

Note cette adresse quelque part.

Dans la suite:

- remplace `192.168.1.15` par ta vraie adresse

## 11. Etape 22. Modifier Le Fichier Rider Pour Android

Ce que tu fais:

1. dans la colonne de gauche de VS Code, clique sur `apps`
2. clique sur `rider-app`
3. clique sur le fichier `.env`
4. cherche cette ligne:

```text
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

5. remplace `localhost` par l IP du PC

Exemple:

```text
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.15:3000
```

6. en haut, clique sur `File`
7. clique sur `Save`

Ce que tu dois voir:

- le point blanc de l onglet disparait
- cela veut dire que le fichier est bien sauvegarde

## 12. Etape 23. Modifier Le Fichier Driver Pour Android

Ce que tu fais:

1. dans la colonne de gauche, clique sur `apps`
2. clique sur `driver-app`
3. clique sur le fichier `.env`
4. cherche cette ligne:

```text
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

5. remplace `localhost` par l IP du PC

Exemple:

```text
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.15:3000
```

6. clique sur `File`
7. clique sur `Save`

## 13. Etape 24. Lancer Le Backend Pour Android

Pour Android, il faut au minimum que le backend tourne.

Ce que tu fais:

1. ouvre un nouveau terminal dans VS Code
2. clique sur `Terminal`
3. clique sur `New Terminal`
4. tape:

```powershell
cd C:\Users\LENOVO\Desktop\mobilis
```

5. appuie sur `Entree`
6. tape:

```powershell
pnpm dev:backend
```

7. appuie sur `Entree`

Important:

- laisse ce terminal ouvert

## 14. Etape 25. Lancer Rider Sur Android

Ce que tu fais:

1. ouvre un nouveau terminal
2. clique sur `Terminal`
3. clique sur `New Terminal`
4. tape:

```powershell
cd C:\Users\LENOVO\Desktop\mobilis
```

5. appuie sur `Entree`
6. tape:

```powershell
pnpm dev:rider
```

7. appuie sur `Entree`
8. attends le QR code

Ce que tu fais sur le telephone:

1. ouvre `Expo Go`
2. appuie sur `Scan QR Code`
3. scanne le QR code affiche dans VS Code

Ce que tu dois voir:

- l application rider s ouvre sur le telephone

## 15. Etape 26. Lancer Driver Sur Android

Ce que tu fais:

1. ouvre un autre terminal
2. clique sur `Terminal`
3. clique sur `New Terminal`
4. tape:

```powershell
cd C:\Users\LENOVO\Desktop\mobilis
```

5. appuie sur `Entree`
6. tape:

```powershell
pnpm dev:driver
```

7. appuie sur `Entree`
8. attends le QR code

Ce que tu fais sur le telephone:

1. ouvre `Expo Go`
2. appuie sur `Scan QR Code`
3. scanne le QR code

Ce que tu dois voir:

- l application driver s ouvre sur le telephone

## 16. Etape 27. Tester Rapidement Les Ecrans Android

### Rider Android

Ce que tu fais:

1. ouvre rider sur le telephone
2. si besoin, connecte-toi avec:

```text
Email: rider@mobilis.app
Mot de passe: Mobilis123!
```

3. ouvre `home`
4. ouvre `book`
5. ouvre `activity`
6. ouvre `voice`

Dans `account`, tu dois aussi voir:

- `Contact de confiance`
- un champ telephone au format `+22670000001`
- les modes `Manuel`, `Nuit`, `Tous trajets`
- le bouton `Enregistrer le contact`

Si une course active existe dans `activity`, tu dois aussi voir:

- une ligne indiquant que partage, code pickup et monitoring route sont
  connectes aux operations
- `SOS securite`: cree un ticket support prioritaire et propose l appel local
  `112`
- `Partager le trajet`: cree un lien securise temporaire a envoyer a un proche
- `Signaler un incident`: cree un signalement support classique
- `Preuve volontaire`: declare une preuve locale avec consentement, sans upload
  automatique
- Cote admin, `System Health` affiche les SLO runtime, la posture de risque et
  la taxonomie d erreurs mobile pour savoir si un probleme vient d auth,
  booking, paiement, realtime ou securite.
- Les apps rider et driver utilisent une taxonomie d erreurs partagee:
  `MOB-AUTH-SESSION`, `MOB-BOOKING-DISPATCH`, `MOB-PAYMENT-PROVIDER`,
  `MOB-REALTIME-DEGRADED`, `MOB-SAFETY-INCIDENT`, `MOB-NETWORK-OFFLINE`,
  `MOB-VALIDATION-INPUT` et `MOB-GENERIC-API`.
- Les erreurs reportables sont aussi placees dans une file locale bornee et
  anonymisee. Les erreurs offline attendues restent visibles a l utilisateur,
  mais ne polluent pas le futur crash/error reporting production.
- Quand une session rider/driver est restauree, la file locale est drainee vers
  l API `/mobile/error-reports`. Le backend audite les rapports et ouvre un
  ticket support pour les signaux critiques.

### Driver Android

Ce que tu fais:

1. ouvre driver sur le telephone
2. si besoin, connecte-toi avec:

```text
Email: driver@mobilis.app
Mot de passe: Mobilis123!
```

3. ouvre `accueil`
4. ouvre `offres`
5. ouvre `revenus`
6. ouvre `profil`

Si une mission active existe dans `offres`, tu dois aussi voir:

- une ligne indiquant que le monitoring route est actif cote operations pendant
  la mission
- `SOS securite`: alerte les operations, journalise la course et propose
  l appel local `112`
- `Partager la mission`: cree un lien securise temporaire pour un proche ou les
  operations terrain
- `Signaler un incident`: envoie un signalement chauffeur au support
- `Preuve volontaire`: declare une preuve locale avec consentement, sans upload
  automatique

Dans `offres`, le snapshot chauffeur affiche aussi `Fatigue`. Si le seuil est
proche ou depasse, une carte de pause conseillee ou obligatoire apparait avant
les offres.

## 17. Si Android Ne Marche Pas

Si le telephone n arrive pas a charger les apps correctement, verifie dans cet ordre:

1. le backend tourne bien avec `pnpm dev:backend`
2. le PC et le telephone sont sur le meme Wi-Fi
3. dans `apps/rider-app/.env`, il n y a plus `localhost`
4. dans `apps/driver-app/.env`, il n y a plus `localhost`
5. l IP ecrite dans les `.env` est bien la bonne
6. l adresse finit bien par `:3000`

Si Windows affiche une fenetre de securite:

1. clique sur `Allow access`
2. coche le reseau prive
3. clique sur `OK`

## 18. Commandes Utiles De Verification

Si quelqu un te demande de verifier que tout est sain, tu peux lancer:

```powershell
pnpm test:mobile:smoke
pnpm --filter backend test -- --runInBand
pnpm typecheck
pnpm lint
```

## 19. Comment Tout Arreter

### Arreter Les Serveurs

Pour chaque terminal qui fait tourner quelque chose:

1. clique dans le terminal
2. appuie sur `Ctrl + C`
3. attends que le terminal redevienne libre

### Arreter La Base Locale

Ce que tu fais:

1. ouvre un terminal a la racine du projet
2. tape:

```powershell
docker compose down
```

3. appuie sur `Entree`

## 20. Resume Tres Simple

Si tu veux juste l ordre des grandes actions:

1. ouvrir `mobilis` dans VS Code
2. ouvrir un terminal
3. lancer `pnpm install`
4. lancer `pnpm setup:local`
5. ouvrir Docker Desktop
6. lancer `pnpm db:start`
7. lancer `pnpm prisma:generate`
8. lancer `pnpm prisma:migrate`
9. lancer `pnpm prisma:seed`
10. verifier Prisma avec `migrate status`
11. lancer `pnpm dev:full-web`
12. ouvrir les pages web
13. pour Android, trouver l IP du PC
14. remplacer `localhost` par l IP dans les `.env`
15. lancer `pnpm dev:backend`
16. lancer `pnpm dev:rider` ou `pnpm dev:driver`
17. scanner le QR code avec `Expo Go`

## 21. Fichiers Et Scripts Importants

- [package.json](/c:/Users/LENOVO/Desktop/mobilis/package.json:1)
- [apps/backend/package.json](/c:/Users/LENOVO/Desktop/mobilis/apps/backend/package.json:1)
- [apps/backend/.env.example](/c:/Users/LENOVO/Desktop/mobilis/apps/backend/.env.example:1)
- [apps/rider-app/.env.example](/c:/Users/LENOVO/Desktop/mobilis/apps/rider-app/.env.example:1)
- [apps/driver-app/.env.example](/c:/Users/LENOVO/Desktop/mobilis/apps/driver-app/.env.example:1)
- [scripts/bootstrap-local.ps1](/c:/Users/LENOVO/Desktop/mobilis/scripts/bootstrap-local.ps1:1)
- [scripts/start-local-db.ps1](/c:/Users/LENOVO/Desktop/mobilis/scripts/start-local-db.ps1:1)
