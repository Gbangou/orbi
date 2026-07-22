# Tester Orbi sur ton ordinateur et ton téléphone — guide pas à pas

> **Ce guide est écrit pour tout le monde.** Tu n'as pas besoin de savoir coder.
> Chaque étape te dit exactement quoi faire, mot pour mot, clic par clic.
> Si quelque chose ne marche pas, il y a une section "Ça ne marche pas ?" à la fin.

---

## Ce dont tu as besoin avant de commencer

Avant de faire quoi que ce soit, vérifie que tu as ces 4 choses :

| Ce qu'il faut | Comment vérifier | Où le télécharger si absent |
|---|---|---|
| **Docker Desktop** | Tu vois une icône de baleine dans ta barre des tâches | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Node.js** | Ouvre un terminal, tape `node --version`, tu vois un numéro | [nodejs.org](https://nodejs.org/) |
| **pnpm** | Dans le terminal, tape `pnpm --version`, tu vois un numéro | Dans le terminal : `npm install -g pnpm` |
| **Expo Go** sur ton téléphone | Tu vois l'app "Expo Go" sur ton téléphone | App Store (iPhone) ou Play Store (Android) |

---

## PARTIE 1 — Tester sur l'ordinateur

### Étape 1 — Ouvrir Docker Desktop

Docker Desktop, c'est le programme qui fait tourner la base de données (l'endroit où sont stockées toutes les informations des utilisateurs, courses, etc.).

1. Double-clique sur l'icône **Docker Desktop** sur ton bureau
2. Attends que la fenêtre s'ouvre et affiche **"Engine running"** (ou une icône verte)
3. Tu peux réduire la fenêtre, elle continue de tourner en arrière-plan

---

### Étape 2 — Ouvrir le dossier du projet dans un terminal

Le terminal, c'est la fenêtre noire où tu tapes des commandes. Ne t'inquiète pas, tu n'as pas besoin de comprendre ce que tu tapes — copie-colle exactement ce qui est écrit.

1. Ouvre l'explorateur de fichiers Windows
2. Va dans le dossier `C:\Users\LENOVO\Desktop\orbi`
3. Clique dans la barre d'adresse en haut (là où il est écrit le chemin du dossier)
4. Tape `powershell` et appuie sur **Entrée**
5. Une fenêtre bleue ou noire s'ouvre — c'est ton terminal

---

### Étape 3 — Préparer l'application (une seule fois)

Dans le terminal, copie-colle cette commande et appuie sur **Entrée** :

```powershell
pnpm setup:local
```

Tu vas voir des textes défiler. C'est normal. Attends que ça s'arrête et que tu vois à nouveau le curseur clignoter.

**Ce que ça fait :** ça copie les fichiers de configuration dont l'application a besoin pour démarrer.

---

### Étape 4 — Démarrer la base de données

```powershell
pnpm db:start
```

Attends le message : `PostgreSQL is ready` ou `healthy`.

**Ce que ça fait :** ça démarre la base de données, comme allumer un tiroir où sont rangées toutes les informations.

---

### Étape 5 — Initialiser les données (une seule fois)

Tape ces commandes **une par une**, en attendant que chacune soit finie avant de taper la suivante :

```powershell
pnpm prisma:generate
```

*(attends que ça finisse)*

```powershell
pnpm prisma:migrate
```

*(attends que ça finisse)*

```powershell
pnpm prisma:seed
```

*(attends que ça finisse)*

**Ce que ça fait :** ça crée les tables dans la base de données et crée 3 comptes de test prêts à utiliser.

---

### Étape 6 — Les 3 comptes de test créés automatiquement

Ces comptes sont créés par l'étape précédente. **Ne les change pas.**

| Qui | Email | Mot de passe |
|---|---|---|
| **Administrateur** (le patron qui voit tout) | `admin@orbi.app` | `Orbi123!` |
| **Passager** (celui qui commande une course) | `rider@orbi.app` | `Orbi123!` |
| **Chauffeur** (celui qui conduit) | `driver@orbi.app` | `Orbi123!` |

---

### Étape 7 — Démarrer l'application

Tu vas ouvrir **3 fenêtres de terminal** en même temps. Chaque fenêtre fait tourner une partie de l'application.

#### Terminal 1 — Le serveur principal (le cerveau de l'app)

Dans ton terminal actuel, tape :

```powershell
pnpm dev:backend
```

Attends le message : `Application is running on: http://[::1]:3000`

**Ne ferme pas cette fenêtre.**

#### Terminal 2 — L'app passager

Ouvre un **nouveau terminal** dans le même dossier (répète l'étape 2). Tape :

```powershell
pnpm dev:rider
```

Attends que le QR code apparaisse dans le terminal.

**Ne ferme pas cette fenêtre.**

#### Terminal 3 — L'app chauffeur

Ouvre un **troisième terminal**. Tape :

```powershell
pnpm dev:driver
```

Attends que le QR code apparaisse.

**Ne ferme pas cette fenêtre.**

#### Terminal 4 — Le tableau de bord admin (optionnel)

Ouvre un **quatrième terminal**. Tape :

```powershell
pnpm dev:admin
```

Attends le message `ready on http://localhost:3001`.

---

### Étape 8 — Tester le tableau de bord admin

1. Ouvre ton navigateur internet (Chrome, Firefox, Edge...)
2. Dans la barre d'adresse, tape exactement : `http://localhost:3001`
3. Tu vois une page de connexion
4. Tape l'email : `admin@orbi.app`
5. Tape le mot de passe : `Orbi123!`
6. Clique sur **"Se connecter"**

Tu dois voir le tableau de bord avec les statistiques, la carte en temps réel, les courses, les chauffeurs, etc.

---

## PARTIE 2 — Tester sur le téléphone

### Étape 9 — Connecter le téléphone au même Wi-Fi que le PC

**Important :** ton téléphone et ton ordinateur doivent être sur le **même réseau Wi-Fi**. Pas en 4G/5G, pas sur un autre réseau — exactement le même.

Pour vérifier :
- Sur ton PC : clique sur l'icône Wi-Fi en bas à droite. Note le nom du réseau.
- Sur ton téléphone : va dans Paramètres → Wi-Fi. Connecte-toi au même réseau.

---

### Étape 10 — Dire au téléphone où trouver l'application

Le téléphone ne peut pas utiliser `localhost` (ce mot signifie "l'ordinateur lui-même" et le téléphone ne sait pas que ça parle du PC). Il faut lui donner l'adresse du PC sur le réseau Wi-Fi.

Dans un terminal, tape :

```powershell
pnpm mobile:lan
```

**Ce que ça fait :** ce script trouve automatiquement l'adresse de ton PC sur le Wi-Fi et la note dans les fichiers de configuration des apps mobile. Tu n'as rien d'autre à faire.

---

### Étape 11 — Ouvrir les apps sur le téléphone

1. Sur ton téléphone, ouvre l'application **Expo Go**
2. Appuie sur le bouton **"Scan QR code"** (scanner le code QR)
3. Pointe l'appareil photo vers le **QR code de l'app passager** (affiché dans le Terminal 2)
4. L'app passager s'ouvre sur ton téléphone

Pour l'app chauffeur :
1. Dans Expo Go, appuie à nouveau sur **"Scan QR code"**
2. Scanne le **QR code de l'app chauffeur** (Terminal 3)
3. L'app chauffeur s'ouvre

> Si les apps ne se connectent pas au serveur, va à la section "Ça ne marche pas ?" en bas.

---

## PARTIE 3 — Faire un vrai trajet de bout en bout

Maintenant qu'on a tout démarré, on va simuler une vraie course : le passager commande, le chauffeur accepte, la course se fait, le passager note.

---

### Étape 12 — S'inscrire (ou se connecter) côté passager

Sur le téléphone avec **l'app passager** :

1. Tu vois un écran avec les mots "Se connecter" et "Créer un compte"
2. Appuie sur **"Se connecter"**
3. Dans le champ "Email", tape : `rider@orbi.app`
4. Dans le champ "Mot de passe", tape : `Orbi123!`
5. Appuie sur **"Se connecter"**

Tu arrives sur la carte principale. Tu vois des petites icônes de voitures qui bougent — ce sont les chauffeurs disponibles près de toi (simulés).

---

### Étape 13 — S'inscrire (ou se connecter) côté chauffeur

Sur le téléphone avec **l'app chauffeur** (ou un deuxième téléphone) :

1. Appuie sur **"Se connecter"**
2. Email : `driver@orbi.app`
3. Mot de passe : `Orbi123!`
4. Appuie sur **"Se connecter"**

Tu arrives sur la carte chauffeur.

5. Cherche le bouton **"Disponible"** ou **"Passer en ligne"** et appuie dessus

Le chauffeur est maintenant visible pour les passagers.

---

### Étape 14 — Commander une course (côté passager)

Sur **l'app passager** :

1. Appuie sur la **barre de recherche** en bas de l'écran (là où il est écrit "Où voulez-vous aller ?")
2. Tape le nom d'un endroit, par exemple : `Marché de Gounghin`
3. Des suggestions apparaissent en dessous — appuie sur la première suggestion
4. Tu vois deux types de véhicules : **Moto** et **Voiture**. Appuie sur l'un d'eux.
5. Tu vois le prix estimé de la course
6. Appuie sur **"Confirmer la réservation"**

Tu es redirigé vers l'écran **"Activité"** qui dit "En attente d'un chauffeur...".

---

### Étape 15 — Accepter la course (côté chauffeur)

Sur **l'app chauffeur**, dans l'onglet **"Offres"** :

1. Une carte apparaît avec les informations de la course : adresse de prise en charge, prix
2. Appuie sur **"Accepter"**

Deux choses se passent en même temps :
- Sur l'app **chauffeur** : une carte s'affiche avec l'itinéraire vers le passager (la route en bleu)
- Sur l'app **passager** : l'écran Activité dit "Votre chauffeur arrive !" et montre une carte

---

### Étape 16 — Arriver au point de prise en charge (côté chauffeur)

Sur **l'app chauffeur** :

1. Appuie sur **"Je suis arrivé"**

Sur **l'app passager** :

1. Un message s'affiche : "Votre chauffeur est arrivé"
2. Verifie le nom du chauffeur, le vehicule et la plaque avant de monter

---

### Étape 17 — Démarrer la course (côté chauffeur)

Sur **l'app chauffeur** :

1. Confirme que le passager est bien dans le vehicule ou sur la moto
2. Appuie sur **"Démarrer la course"**

La course est maintenant **en cours**. Les deux apps affichent la route vers la destination.

---

### Étape 18 — Terminer la course (côté chauffeur)

Sur **l'app chauffeur** :

1. Appuie sur **"Terminer la course"**

---

### Étape 19 — Voir le reçu et noter le chauffeur (côté passager)

Sur **l'app passager** :

1. L'écran **Reçu** s'ouvre automatiquement
2. Tu vois : le montant payé, la distance, la durée, le nom du chauffeur
3. Appuie sur **"Évaluer le chauffeur"**
4. Appuie sur le nombre d'étoiles que tu veux donner (5 étoiles = excellent)
5. Appuie sur **"Envoyer"**

**Félicitations — tu as fait un trajet complet de bout en bout !**

---

### Étape 20 — Vérifier dans l'admin

Dans ton navigateur, sur `http://localhost:3001` :

1. Tu vois le trajet qui vient d'être terminé dans les statistiques
2. Le montant est crédité au chauffeur dans son portefeuille
3. La carte LiveOps (Operations en direct) montre l'historique

---

## Ce que chaque partie fait (en résumé simple)

```
Ton ordinateur
│
├── Serveur principal (Terminal 1, port 3000)
│   └── C'est le cerveau. Il reçoit toutes les demandes, stocke les infos.
│
├── App Passager (Terminal 2, port 8081)
│   └── Ce que voit le passager sur son téléphone ou navigateur.
│
├── App Chauffeur (Terminal 3, port 8082)
│   └── Ce que voit le chauffeur sur son téléphone.
│
└── Admin (Terminal 4, port 3001)
    └── Le tableau de bord pour voir tout ce qui se passe.
```

---

## Ça ne marche pas ? Solutions aux problèmes courants

### "Le QR code ne charge rien sur mon téléphone"

**Cause la plus probable :** le téléphone n'est pas sur le même Wi-Fi que le PC.

Solution :
1. Sur ton téléphone, va dans Paramètres → Wi-Fi
2. Connecte-toi au même réseau Wi-Fi que ton PC
3. Retape `pnpm mobile:lan` dans un terminal
4. Rescanne le QR code

---

### "L'app s'ouvre mais dit 'Impossible de se connecter au serveur'"

Solution :
1. Vérifie que le Terminal 1 (serveur principal) est bien ouvert et affiche `running on port 3000`
2. Dans un terminal, tape :

```powershell
netsh advfirewall firewall add rule name="Orbi Dev" dir=in action=allow protocol=TCP localport=3000
```

3. Relance `pnpm mobile:lan` puis rescanne le QR code

---

### "La connexion échoue — 'Email ou mot de passe incorrect'"

Les comptes de test ont peut-être été effacés. Solution :

```powershell
pnpm prisma:seed
```

Puis réessaie avec `rider@orbi.app` / `Orbi123!`.

---

### "Le compte est bloqué"

Si tu as essayé un mauvais mot de passe plus de 5 fois, le compte se bloque 15 minutes. Attends 15 minutes ou relance `pnpm prisma:seed`.

---

### "Docker dit 'port already in use'"

Un autre programme utilise le même port. Solution :

```powershell
docker compose down
pnpm db:start
```

---

### "Je vois une page blanche dans le navigateur"

Attends 30 secondes que le serveur finisse de démarrer, puis recharge la page (appuie sur **F5**).

---

### "Je ne vois pas de QR code dans le terminal"

Cherche la ligne qui dit `› Metro waiting on exp://...` — le QR code est juste au-dessus. Fais défiler vers le haut dans le terminal.

---

## Vérifications finales — comment savoir que tout marche

Coche chaque case mentalement :

- [ ] `http://localhost:3001` — l'admin s'affiche et on peut se connecter
- [ ] L'app passager s'ouvre sur le téléphone et on peut se connecter
- [ ] L'app chauffeur s'ouvre sur le téléphone et on peut se connecter
- [ ] Le passager peut commander une course et la voir en "Activité"
- [ ] Le chauffeur voit la demande dans "Offres" et peut l'accepter
- [ ] La carte montre l'itinéraire dans les deux apps
- [ ] La course peut être terminée et notée

Si toutes les cases sont cochées : **l'application fonctionne correctement.**

---

*Dernière mise à jour : 24 mai 2026*
