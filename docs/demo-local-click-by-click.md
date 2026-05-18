# Demo locale Orbi clic par clic

Date de reference: 18 mai 2026

Ce guide explique comment tester une demo locale qui fonctionne vraiment:
sessions reelles, identifiants/mots de passe, rider, driver, admin, course
active et mouvement GPS visible dans les apps.

## 1. Preparer la machine

1. Ouvrir Docker Desktop.
2. Attendre que Docker indique qu il est lance.
3. Ouvrir un terminal PowerShell 7 dans le dossier du repo Orbi.
4. Lancer:

```powershell
pnpm install
pnpm setup:local
pnpm db:start
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

Si une commande echoue parce que PostgreSQL n est pas pret, attendre quelques
secondes puis relancer la commande echouee.

## 2. Demarrer la demo sur ordinateur

### Rider web + admin

1. Dans un terminal, lancer:

```powershell
pnpm dev:full-web
```

2. Attendre que le backend, l admin et Expo web soient prets.
3. Ouvrir l admin:

```text
http://localhost:3001
```

4. Ouvrir le rider web. L URL est affichee dans le terminal Expo, souvent:

```text
http://localhost:8081/auth
```

### Driver web

Expo web utilise souvent le meme port pour rider et driver. Pour tester le
driver web proprement:

1. Arreter le terminal `pnpm dev:full-web` avec `Ctrl+C`.
2. Lancer:

```powershell
pnpm dev:web-driver-preview
```

3. Ouvrir:

```text
http://localhost:8081/auth
```

Si un autre port est affiche dans le terminal Expo, utiliser ce port.

## 3. Comptes de demo

Ces comptes sont crees par `pnpm prisma:seed`.

| Surface | Email | Mot de passe |
| --- | --- | --- |
| Admin | `admin@orbi.app` | `Orbi123!` |
| Rider | `rider@orbi.app` | `Orbi123!` |
| Driver | `driver@orbi.app` | `Orbi123!` |

## 4. Se connecter a l admin

1. Aller sur `http://localhost:3001`.
2. Dans le bloc `Session admin`, verifier l email:

```text
admin@orbi.app
```

3. Saisir le mot de passe:

```text
Orbi123!
```

4. Cliquer sur `Se connecter`.
5. Attendre le retour sur la page admin.
6. Verifier que la page affiche les panneaux operations, live ops, onboarding,
   paiements, wallets et readiness.

Raccourci local:

1. Cliquer sur `Demo admin`.
2. La page ouvre une session admin avec le meme endpoint auth backend.

Pour fermer:

1. Cliquer sur `Deconnexion`.
2. La session admin locale est effacee.

## 5. Se connecter au rider

1. Ouvrir l URL rider, par exemple `http://localhost:8081/auth`.
2. Cliquer sur `Utiliser le compte demo`, ou saisir:

```text
Email: rider@orbi.app
Mot de passe: Orbi123!
```

3. Verifier que les lignes de preparation indiquent `Email pret` et
   `Mot de passe pret`.
4. Cliquer sur `Se connecter`.
5. L app doit ouvrir l accueil rider.
6. Cliquer sur `Reservation` ou `Ouvrir la reservation` selon la navigation
   visible.
7. Choisir une option de trajet.
8. Cliquer sur le bouton de creation de demande.
9. Aller dans `Activite` pour voir la course active et la carte de suivi.

Raccourci local:

1. Sur `/auth`, cliquer sur `Demo rider`.
2. L app connecte le rider et ouvre l accueil.

## 6. Se connecter au driver

1. Ouvrir l URL driver, par exemple `http://localhost:8081/auth` quand
   `pnpm dev:web-driver-preview` est lance.
2. Cliquer sur `Utiliser le compte demo`, ou saisir:

```text
Email: driver@orbi.app
Mot de passe: Orbi123!
```

3. Verifier que les lignes de preparation indiquent `Email pret` et
   `Mot de passe pret`.
4. Cliquer sur `Se connecter`.
5. L app doit ouvrir l accueil chauffeur.
6. Cliquer sur `Offres` ou `Voir toutes les offres`.
7. Mettre le chauffeur en ligne si le bouton est visible.
8. Accepter une offre disponible.
9. Dans l ecran offres, verifier la carte mission, les marqueurs `Rider` et
   `Driver`, la precision GPS et les coordonnees.

Raccourci local:

1. Sur `/auth`, cliquer sur `Demo driver`.
2. L app connecte le driver et ouvre l accueil.

## 7. Generer une vraie course demo avec mouvement GPS

Cette commande est la plus directe pour prouver que la demo n est pas statique.
Elle se connecte au backend avec les vrais comptes seedes, cree une vraie
course active et poste des positions GPS successives du driver.

1. Garder le backend local lance.
2. Ouvrir rider et driver, puis se connecter avec les comptes demo.
3. Dans un nouveau terminal a la racine du repo, lancer:

```powershell
pnpm demo:local-live-session
```

4. Attendre le message:

```text
Local demo live session is ready.
```

5. Dans l app rider, aller dans `Activite`.
6. Cliquer sur `Actualiser le suivi` si l ecran ne se met pas a jour tout seul.
7. Verifier que la carte affiche:
   - `Rider`
   - `Driver`
   - une coordonnee du type `Zone chauffeur approx. ...`
   - `Precision ... m`
   - une distance restante vers le pickup
8. Dans l app driver, aller dans `Offres`.
9. Cliquer sur `Actualiser le direct`.
10. Verifier que la carte mission affiche:
    - `Rider`
    - `Driver`
    - une coordonnee du type `Zone mission approx. ...`
    - `Precision ... m`
    - une distance restante vers le pickup

Pour poster de nouveaux mouvements pendant que les ecrans sont ouverts:

```powershell
pnpm demo:local-live-session
```

Pour faire aussi demarrer la course et montrer le mouvement vers la destination:

```powershell
pnpm demo:local-live-session -- -StartTrip
```

## 8. Tester sur telephone avec Expo Go

Le telephone ne peut pas utiliser `localhost` pour appeler le backend du PC.
Il faut lui donner l IP Wi-Fi du PC.

1. Verifier que le PC et le telephone sont sur le meme Wi-Fi.
2. Lancer:

```powershell
pnpm mobile:lan
pnpm mobile:check
```

3. Si `mobile:check` echoue, relancer avec l IP exacte du PC:

```powershell
pnpm mobile:lan -- -HostIp 192.168.1.20
pnpm mobile:check
```

4. Lancer les apps mobiles:

```powershell
pnpm dev:full-mobile
```

5. Ouvrir Expo Go sur le telephone.
6. Scanner le QR code rider dans le terminal.
7. Se connecter avec:

```text
rider@orbi.app / Orbi123!
```

8. Scanner le QR code driver dans l autre terminal ou ouvrir l app driver
   depuis Expo Go si elle est deja listee.
9. Se connecter avec:

```text
driver@orbi.app / Orbi123!
```

10. Depuis le PC, lancer:

```powershell
pnpm demo:local-live-session
```

11. Sur le telephone rider, ouvrir `Activite` et verifier la carte.
12. Sur le telephone driver, ouvrir `Offres` et verifier la carte mission.

Si le telephone ne charge pas les donnees:

1. Verifier que Windows Firewall autorise Node.js.
2. Verifier que le backend repond depuis le PC:

```text
http://localhost:3000/api/v1/health
```

3. Verifier que les fichiers `apps/rider-app/.env` et `apps/driver-app/.env`
   contiennent une URL `http://192.168.x.x:3000`, pas `localhost`.
4. Relancer Expo apres `pnpm mobile:lan`.

## 9. Verification backend automatique

Pour tester le flux backend complet sans cliquer:

```powershell
pnpm e2e:local-api
```

Cette commande couvre login, booking, acceptation chauffeur, positions route,
pickup code, paiement mobile money local, webhook, wallet, payout, refund et
compteurs admin.

## 10. Probleme courant

### Le bouton de connexion semble bloque

Verifier les messages sous le formulaire:

- `Email pret`
- `Mot de passe pret`
- `Nom complet pret` en inscription

Le bouton reste desactive si le mot de passe fait moins de 8 caracteres.

### Le login echoue

Relancer:

```powershell
pnpm prisma:seed
```

Puis reessayer avec `Orbi123!`.

### La carte ne bouge pas

Lancer:

```powershell
pnpm demo:local-live-session
```

Puis cliquer sur `Actualiser le suivi` cote rider et `Actualiser le direct`
cote driver.

### Le driver ne voit pas d offre

Lancer:

```powershell
pnpm demo:local-live-session
```

Cette commande cree la demande et l accepte avec le driver demo. Elle laisse
ensuite une course active visible dans les deux apps.

## 11. Definition de demo locale reussie

La demo locale est valide quand:

1. Admin peut se connecter avec email/mot de passe.
2. Rider peut se connecter avec email/mot de passe.
3. Driver peut se connecter avec email/mot de passe.
4. Rider voit une course active dans `Activite`.
5. Driver voit la meme mission dans `Offres`.
6. Les deux cartes affichent `Rider`, `Driver`, precision GPS et coordonnees.
7. `pnpm demo:local-live-session` poste de nouveaux signaux sans erreur.
8. `pnpm e2e:local-api` passe pour le flux backend complet.
