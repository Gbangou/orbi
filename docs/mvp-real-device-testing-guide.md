# Guide clic par clic: test terrain reel Orbi sur Android

Ce document explique comment tester Orbi avec de vrais telephones Android, en
donnees mobiles 4G/5G, sans que les testeurs soient sur le meme Wi-Fi.

Objectif: un test serieux et realiste avec:

- 1 app Orbi Passager installee sur un telephone Android;
- 1 app Orbi Chauffeur installee sur un autre telephone Android;
- 1 backend Orbi accessible en HTTPS public;
- 1 base de donnees PostgreSQL `orbi`;
- 1 personne operations qui observe les tests et note les incidents.

Important: un tunnel gratuit est pratique pour un pilote terrain court, mais il
depend du PC et peut changer d'URL. Pour un pilote permanent, utiliser ensuite
un vrai backend staging, par exemple `https://api-staging.orbi.app`.

## 1. Etat actuel a utiliser

### Etat valide au 27 mai 2026

Backend local a verifier au moment du test:

```text
http://127.0.0.1:3000/api/v1/health/ready
```

Pour le test terrain serieux, l'etat important n'est pas le backend du PC local.
L'etat important est l'API publique staging:

```text
https://API_STAGING/api/v1/health/ready -> 200 ready
```

Base de donnees:

```text
postgresql://postgres:postgres@localhost:5433/orbi?schema=public
```

API publique stable:

```text
Pas encore valide.
```

Ne pas lancer le test terrain tant qu'une URL HTTPS publique ne repond pas
`200` sur `/api/v1/health/ready`.

Solution recommandee pour un test terrain serieux:

```text
deploy/staging
```

Cette option deploie le backend sur un vrai serveur public avec PostgreSQL et
HTTPS stable. C'est la solution a utiliser pour des telephones reels en data
mobile independante.

### APK Passager

Ancien build disponible, mais a ne pas utiliser pour le test terrain actuel si
l'URL publique a change:

```text
https://expo.dev/accounts/gbangou/projects/orbi-passager/builds/5b364263-689e-46ff-a8eb-f19f0eff8a44
```

### APK Chauffeur

Ancien build disponible, mais a ne pas utiliser pour le test terrain actuel si
l'URL publique a change:

```text
https://expo.dev/accounts/gbangou/projects/orbi-chauffeur/builds/e9e0376a-a58d-447d-8cb4-f50fb64e3013
```

### API publique de test

Les anciennes APK appelaient cette URL, qui n'est plus consideree valide:

```text
https://lazy-carrots-smell.loca.lt
```

La verification obligatoire avant tout nouveau build est:

```text
https://NOUVELLE_URL_PUBLIQUE/api/v1/health/ready
```

La reponse doit indiquer `status: ready`.

## 2. Regles avant de commencer

Ne lance pas le test terrain si une de ces conditions est fausse:

- le PC Orbi est allume;
- Docker Desktop tourne;
- le conteneur PostgreSQL tourne;
- le backend Orbi tourne;
- le tunnel HTTPS public tourne;
- l'URL publique `/api/v1/health/ready` repond;
- les deux telephones ont une connexion data mobile active;
- les deux APK sont installes;
- une personne ops suit le test et note les bugs.

Pendant ce test:

- ne pas utiliser de gros montants;
- privilegier cash/test si le paiement reel n'est pas encore valide;
- ne pas donner l'APK a des personnes hors pilote ferme;
- noter chaque bug avec heure, telephone, compte, capture d'ecran et action faite.

## 3. Demarrer le PC de test

### 3.1 Ouvrir le dossier projet

1. Allumer le PC.
2. Ouvrir `Explorateur de fichiers`.
3. Aller dans:

```text
C:\Users\LENOVO\Desktop\orbi
```

4. Cliquer dans la barre d'adresse.
5. Taper `powershell`.
6. Appuyer sur `Entree`.

PowerShell doit s'ouvrir directement dans le dossier Orbi.

### 3.2 Verifier Docker et PostgreSQL

Dans PowerShell:

```powershell
docker ps
```

Resultat attendu: une ligne avec `backend-db-1` et `healthy`.

Si rien n'apparait:

```powershell
pnpm db:start
```

Puis verifier encore:

```powershell
docker ps
```

## 4. Verifier que la base utilise bien `orbi`

Dans PowerShell:

```powershell
Get-Content apps\backend\.env
```

La ligne importante doit etre:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/orbi?schema=public
```

Si tu vois `mobilis`, ce n'est pas bon. Remplacer par `orbi`.

## 5. Preparer la base de donnees `orbi`

Dans PowerShell:

```powershell
docker exec backend-db-1 psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'orbi'"
```

Si la commande ne renvoie rien, creer la base:

```powershell
docker exec backend-db-1 psql -U postgres -c "CREATE DATABASE orbi"
```

Appliquer les migrations:

```powershell
pnpm prisma:migrate
```

Ajouter les donnees initiales:

```powershell
pnpm prisma:seed
```

Resultat attendu:

```text
All migrations have been successfully applied.
Seeded Orbi foundation data
```

## 6. Demarrer le backend Orbi

Le backend doit ecouter sur le port `3000`.

### Methode recommandee pour ce repo

Dans PowerShell, depuis `C:\Users\LENOVO\Desktop\orbi`:

```powershell
pnpm --filter backend build
cd apps\backend
node -r ./node_modules/ts-node/register -r ./node_modules/tsconfig-paths/register ./dist/src/main.js
```

Laisser cette fenetre ouverte.

Ne pas la fermer pendant le test.

### Verifier le backend local

Ouvrir une deuxieme fenetre PowerShell dans `C:\Users\LENOVO\Desktop\orbi`.

Taper:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/v1/health/ready -UseBasicParsing
```

Resultat attendu:

```text
StatusCode : 200
```

Si le port `3000` est deja occupe, cela peut vouloir dire qu'un backend tourne
deja. Verifier avec:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/v1/health/ready -UseBasicParsing
```

Si cela repond `200`, continuer.

## 7. Ouvrir une URL HTTPS publique stable

Cette etape rend le backend accessible depuis les telephones en data mobile.
Pour un test terrain serieux, ne pas dependre du PC local ni d'une URL de tunnel
gratuite qui change.

### 7.1 Methode recommandee: serveur staging public

Utiliser un VPS ou serveur cloud avec:

- Docker;
- PostgreSQL;
- Caddy pour HTTPS automatique;
- deux domaines stables, par exemple `api-staging.orbi.app` et
  `admin-staging.orbi.app`.

Le repo contient la configuration prete ici:

```text
deploy/staging
```

Sur le serveur:

```bash
cd orbi/deploy/staging
cp .env.example .env
nano .env
docker compose up -d --build
```

Initialiser les donnees utiles au pilote ferme:

```bash
docker compose run --rm seed
```

Verifier ensuite:

```bash
curl -i https://api-staging.orbi.app/api/v1/health/ready
curl -I https://admin-staging.orbi.app
```

Le resultat doit etre `HTTP/2 200` et contenir `status: ready`.

Quand cette URL est valide, construire les APK:

```powershell
pnpm field:api:check --ApiUrl https://api-staging.orbi.app --AdminUrl https://admin-staging.orbi.app
pnpm mobile:field --ApiUrl https://api-staging.orbi.app --App all --Profile mvp
```

Le script refuse maintenant:

- les URLs `http://`;
- `localhost`, `127.0.0.1`, `0.0.0.0`;
- toute URL publique dont `/api/v1/health/ready` ne repond pas `200 ready`.

### 7.2 Option temporaire seulement: ngrok avec authtoken

Ngrok peut servir pour un test court, mais ce n'est pas la solution principale
pour un terrain serieux: l'URL peut changer et le tunnel depend du PC.

Une seule fois, creer un compte ngrok et installer l'authtoken:

1. Ouvrir `https://dashboard.ngrok.com/signup`.
2. Creer ou connecter le compte.
3. Ouvrir `https://dashboard.ngrok.com/get-started/your-authtoken`.
4. Copier la commande `ngrok config add-authtoken ...`.
5. Dans PowerShell, executer cette commande.

Ensuite, lancer le tunnel:

```powershell
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:ALL_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:GIT_HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:GIT_HTTPS_PROXY -ErrorAction SilentlyContinue

& "C:\Users\LENOVO\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http 3000
```

Laisser cette fenetre ouverte pendant tout le test.

Ngrok affiche une URL du type:

```text
https://quelque-chose.ngrok-free.app
```

Copier cette URL. Elle devient `NOUVELLE_URL_PUBLIQUE`.

### 7.3 Verifier l'URL publique ngrok

Dans une autre fenetre PowerShell:

```powershell
node -e "fetch('https://NOUVELLE_URL_PUBLIQUE/api/v1/health/ready').then(async r=>{console.log(r.status); console.log(await r.text())}).catch(e=>console.error(e.message))"
```

Resultat attendu:

```text
200
{"status":"ready", ...}
```

Ne pas continuer si ce test ne renvoie pas `200`.

### 7.4 Alternative courte: Cloudflare Tunnel

Ouvrir une nouvelle fenetre PowerShell.

Taper:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3000
```

Laisser cette fenetre ouverte.

Cloudflare affiche une URL du type:

```text
https://quelque-chose.trycloudflare.com
```

Si `cloudflared` affiche:

```text
failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": context deadline exceeded
```

alors Cloudflare est bloque depuis le reseau du PC. Revenir a ngrok avec
authtoken ou utiliser un vrai backend staging.

Important: si l'URL publique change, les APK deja construits ne pointeront plus
vers la bonne API. Il faut modifier `.env` et reconstruire les APK.

## 8. Installer l'APK Passager sur Android

Sur le telephone passager:

1. Couper le Wi-Fi.
2. Activer les donnees mobiles.
3. Ouvrir Chrome.
4. Coller le lien:

```text
https://expo.dev/accounts/gbangou/projects/orbi-passager/builds/5b364263-689e-46ff-a8eb-f19f0eff8a44
```

5. Appuyer sur `Entree`.
6. Sur la page Expo, appuyer sur `Install` ou `Download`.
7. Attendre le telechargement du fichier `.apk`.
8. Ouvrir le fichier telecharge.
9. Si Android bloque l'installation, appuyer sur `Parametres`.
10. Activer `Autoriser depuis cette source`.
11. Revenir en arriere.
12. Appuyer sur `Installer`.
13. Attendre la fin.
14. Appuyer sur `Ouvrir`.

Verifier que l'icone Orbi apparait bien sur le telephone.

## 9. Installer l'APK Chauffeur sur Android

Sur le telephone chauffeur:

1. Couper le Wi-Fi.
2. Activer les donnees mobiles.
3. Ouvrir Chrome.
4. Coller le lien:

```text
https://expo.dev/accounts/gbangou/projects/orbi-chauffeur/builds/e9e0376a-a58d-447d-8cb4-f50fb64e3013
```

5. Appuyer sur `Entree`.
6. Appuyer sur `Install` ou `Download`.
7. Ouvrir le fichier `.apk`.
8. Autoriser l'installation depuis Chrome si Android le demande.
9. Appuyer sur `Installer`.
10. Appuyer sur `Ouvrir`.

Verifier que l'icone Orbi apparait bien sur le telephone.

## 10. Test reseau avant de commencer une course

Faire ce test avec le Wi-Fi coupe sur les deux telephones.

### Telephone passager

1. Ouvrir `Orbi Passager`.
2. Essayer de se connecter ou creer un compte test.
3. Si l'app charge sans erreur reseau, c'est bon.

### Telephone chauffeur

1. Ouvrir `Orbi Chauffeur`.
2. Essayer de se connecter ou creer un compte test.
3. Aller sur l'accueil chauffeur.
4. Passer disponible/en ligne si l'option est presente.

### PC operations

Dans PowerShell:

```powershell
node -e "fetch('https://NOUVELLE_URL_PUBLIQUE/api/v1/health/ready').then(async r=>{console.log(r.status); console.log(await r.text())})"
```

Le resultat doit rester `200`.

## 11. Scenario terrain minimal: une course complete

Faire ce scenario une premiere fois sans paiement reel.

### Preparation

1. Mettre le passager et le chauffeur dans deux lieux differents si possible.
2. Garder les deux telephones en donnees mobiles.
3. Garder le PC allume.
4. Garder la fenetre backend ouverte.
5. Garder la fenetre du tunnel HTTPS ouverte.
6. Noter l'heure de debut du test.

### Cote chauffeur

1. Ouvrir `Orbi Chauffeur`.
2. Se connecter.
3. Aller sur l'ecran accueil/cockpit.
4. Passer disponible.
5. Verifier que le telephone ne dort pas.

### Cote passager

1. Ouvrir `Orbi Passager`.
2. Se connecter.
3. Choisir un point de depart.
4. Choisir une destination.
5. Verifier le prix affiche.
6. Confirmer la demande.

### Acceptation chauffeur

1. Sur le telephone chauffeur, attendre l'offre.
2. Appuyer sur accepter.
3. Verifier que l'app chauffeur passe dans le flux course active.
4. Sur le telephone passager, verifier que le chauffeur apparait.

### Pickup

1. Le chauffeur indique son arrivee.
2. Le passager donne le code pickup si l'app l'affiche.
3. Le chauffeur saisit le code.
4. Verifier que la course demarre.

### Fin de course

1. Le chauffeur termine la course.
2. Le passager voit le statut termine.
3. Noter le resultat:
   - course creee;
   - offre recue;
   - offre acceptee;
   - pickup OK;
   - fin OK;
   - aucun crash.

## 12. Tests a faire pendant le pilote

Faire ces tests un par un. Ne pas tout faire en meme temps.

### Test A: connexion

- passager cree un compte;
- chauffeur cree un compte;
- deconnexion;
- reconnexion.

### Test B: disponibilite chauffeur

- chauffeur passe disponible;
- chauffeur repasse indisponible;
- chauffeur repasse disponible;
- verifier que l'app ne plante pas.

### Test C: demande de course

- passager cree une demande;
- chauffeur recoit l'offre;
- chauffeur accepte;
- course continue jusqu'a la fin.

### Test D: refus ou silence chauffeur

- passager cree une demande;
- chauffeur refuse ou ne repond pas;
- verifier que l'app passager reste comprehensible.

### Test E: annulation

- passager annule avant acceptation;
- passager annule apres acceptation si l'app le permet;
- chauffeur annule si l'app le permet;
- noter ce que voit chaque personne.

### Test F: reseau instable

- garder la data mobile;
- passer dans une zone de faible reseau;
- mettre le telephone en veille puis rouvrir;
- verifier si le statut revient correctement.

### Test G: support/SOS

- tester seulement en protocole interne;
- ne pas appeler inutilement les urgences;
- verifier qu'un incident ou ticket est cree si la fonctionnalite existe.

## 13. Tableau de suivi terrain

Remplir une ligne par test.

| Heure | Testeur | Role | Telephone | Reseau | Action | Resultat | Bug | Capture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 09:10 | Awa | Passager | Samsung A12 | Orange 4G | Connexion | OK | Non | Oui |
| 09:15 | Issa | Chauffeur | Tecno | Moov 4G | Disponible | OK | Non | Oui |
| 09:20 | Awa/Issa | Course | 2 telephones | Data mobile | Course complete | OK | Non | Oui |

## 14. Que faire si ca ne marche pas

### Probleme: Cloudflare Tunnel affiche `context deadline exceeded`

Exemple d'erreur:

```text
failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": context deadline exceeded
```

Cela veut souvent dire que PowerShell ou Windows force les requetes Internet a
passer par un proxy invalide.

Dans la meme fenetre PowerShell, verifier:

```powershell
Get-ChildItem Env:*PROXY*
```

Si tu vois des valeurs comme:

```text
http://127.0.0.1:9
```

les supprimer pour la fenetre actuelle:

```powershell
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:ALL_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:GIT_HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:GIT_HTTPS_PROXY -ErrorAction SilentlyContinue
```

Tester Internet:

```powershell
node -e "fetch('https://www.cloudflare.com').then(r=>console.log(r.status)).catch(e=>console.error(e.message))"
```

Resultat attendu:

```text
200
```

Relancer ensuite:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3000
```

Si `cloudflared` cree une URL mais affiche ensuite des erreurs comme:

```text
UDP Connectivity ... FAIL
TCP Connectivity ... FAIL
Cloudflare API ... FAIL
ERROR: Allow outbound QUIC traffic on port 7844 or use HTTP2.
```

tester d'abord l'URL creee. Exemple:

```powershell
node -e "fetch('https://outreach-based-enjoying-villas.trycloudflare.com/api/v1/health/ready').then(async r=>{console.log(r.status); console.log(await r.text())}).catch(e=>console.error(e.message))"
```

Remplacer l'URL par celle affichee dans ta fenetre `cloudflared`.

Si le test ne renvoie pas `200`, fermer `cloudflared` avec `Ctrl+C`, puis
relancer le tunnel en forcant HTTP/2:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --protocol http2 --url http://127.0.0.1:3000
```

Si HTTP/2 echoue aussi, le reseau bloque Cloudflare Tunnel. Essayer un autre
reseau Internet sur le PC, par exemple partage de connexion mobile, autre Wi-Fi
ou VPN autorise.

Si l'erreur arrive avant meme que l'URL soit creee:

```text
failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": context deadline exceeded
```

alors `cloudflared` ne peut pas joindre l'API qui cree les tunnels rapides.
Tester:

```powershell
node -e "fetch('https://api.trycloudflare.com/tunnel',{method:'POST'}).then(async r=>{console.log(r.status); console.log((await r.text()).slice(0,300))}).catch(e=>console.error(e.message))"
```

Si cette commande affiche encore `fetch failed` ou expire, le reseau actuel du
PC bloque `api.trycloudflare.com`. Dans ce cas:

1. connecter le PC a un autre reseau;
2. ou utiliser le partage de connexion mobile du telephone;
3. ou utiliser un VPN autorise;
4. puis relancer `cloudflared`.

Ne reconstruire aucun APK tant que l'URL publique ne repond pas `200` sur
`/api/v1/health/ready`.

Si le proxy revient a chaque nouvelle fenetre PowerShell, supprimer aussi les
variables proxy persistantes de ton utilisateur Windows:

```powershell
[Environment]::SetEnvironmentVariable('HTTP_PROXY', $null, 'User')
[Environment]::SetEnvironmentVariable('HTTPS_PROXY', $null, 'User')
[Environment]::SetEnvironmentVariable('ALL_PROXY', $null, 'User')
[Environment]::SetEnvironmentVariable('GIT_HTTP_PROXY', $null, 'User')
[Environment]::SetEnvironmentVariable('GIT_HTTPS_PROXY', $null, 'User')
```

Fermer PowerShell, rouvrir PowerShell, puis verifier:

```powershell
Get-ChildItem Env:*PROXY*
```

Important: `https://api.trycloudflare.com/tunnel` n'est pas l'URL Orbi. C'est
l'API interne de Cloudflare utilisee par `cloudflared`. L'URL Orbi est seulement
l'URL `https://...trycloudflare.com` affichee apres la creation reussie du tunnel.

### Probleme: l'app affiche une erreur reseau

Verifier dans cet ordre:

1. Le telephone est bien en data mobile.
2. Le PC est allume.
3. Docker tourne.
4. Le backend repond:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:3000/api/v1/health/ready -UseBasicParsing
```

5. Le tunnel repond:

```powershell
node -e "fetch('https://NOUVELLE_URL_PUBLIQUE/api/v1/health/ready').then(async r=>{console.log(r.status); console.log(await r.text())})"
```

6. La fenetre du tunnel n'a pas ete fermee.
7. L'URL du tunnel n'a pas change.

### Probleme: le tunnel a change d'URL

Si ngrok ou Cloudflare donne une nouvelle URL:

1. Copier la nouvelle URL.
2. Modifier:

```text
apps/rider-app/.env
apps/driver-app/.env
```

3. Mettre:

```env
EXPO_PUBLIC_API_BASE_URL=https://NOUVELLE_URL_PUBLIQUE
EXPO_PUBLIC_API_VERSION=v1
```

4. Relancer:

```powershell
pnpm test:mobile:smoke
pnpm typecheck
pnpm build:android:rider:mvp
pnpm build:android:driver:mvp
```

5. Reinstaller les nouveaux APK.

### Probleme: le backend ne demarre pas

Verifier:

```powershell
docker ps
Get-Content apps\backend\.env
pnpm prisma:migrate
pnpm --filter backend build
```

La base doit etre `orbi`, pas `mobilis`.

### Probleme: Android bloque l'installation

Sur le telephone:

1. Ouvrir `Parametres`.
2. Chercher `Installer applis inconnues`.
3. Choisir `Chrome`.
4. Activer `Autoriser depuis cette source`.
5. Revenir au fichier APK.
6. Installer.

## 15. Checklist avant de donner les APK aux testeurs

- [ ] Base PostgreSQL `orbi` creee.
- [ ] `apps/backend/.env` pointe vers `orbi`.
- [ ] `pnpm prisma:migrate` OK.
- [ ] `pnpm prisma:seed` OK.
- [ ] Backend local `/health/ready` repond `200`.
- [ ] API staging publique active, ou tunnel HTTPS valide seulement pour essai court.
- [ ] URL publique `/health/ready` repond `200`.
- [ ] `apps/rider-app/.env` contient la bonne URL HTTPS.
- [ ] `apps/driver-app/.env` contient la bonne URL HTTPS.
- [ ] `pnpm test:mobile:smoke` OK.
- [ ] `pnpm typecheck` OK.
- [ ] APK Passager reconstruit apres changement URL.
- [ ] APK Chauffeur reconstruit apres changement URL.
- [ ] Wi-Fi coupe sur les telephones.
- [ ] Donnees mobiles actives sur les telephones.
- [ ] Une personne ops suit le test.

## 16. Message a envoyer aux testeurs

```text
Bonjour, voici la version test terrain de Orbi.

Merci de tester uniquement avec les donnees mobiles, Wi-Fi coupe.
Cette version est reservee au pilote ferme.
Ne faites pas de gros paiements.
Si vous voyez un bug, envoyez une capture d'ecran avec l'heure et ce que vous faisiez.
Si l'app bloque ou affiche une erreur reseau, prevenez l'equipe Orbi avant de continuer.
```

Ajouter le bon lien selon le role:

Passager:

```text
https://expo.dev/accounts/gbangou/projects/orbi-passager/builds/5b364263-689e-46ff-a8eb-f19f0eff8a44
```

Chauffeur:

```text
https://expo.dev/accounts/gbangou/projects/orbi-chauffeur/builds/e9e0376a-a58d-447d-8cb4-f50fb64e3013
```

## 17. Limites du setup actuel

Ce setup est bon pour un test terrain court et supervise.

Limites:

- si le PC s'eteint, l'API tombe;
- si Internet du PC tombe, l'API tombe;
- si la fenetre du tunnel est fermee, l'API tombe;
- l'URL publique peut changer au prochain lancement;
- ce n'est pas une production permanente.

Pour un pilote plus large, passer a:

```text
https://api-staging.orbi.app
```

avec:

- serveur cloud permanent;
- PostgreSQL cloud;
- HTTPS stable;
- logs centralises;
- sauvegardes;
- monitoring;
- procedure de rollback.
