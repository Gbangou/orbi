# Mobilis Local Development

Ce guide est la version la plus simple pour voir Mobilis evoluer en local avant un deploiement beta ou MVP.

## Ce qu il faut installer une seule fois

- Node.js
- pnpm
- Docker Desktop
- Expo Go sur votre telephone Android si vous voulez voir les apps mobiles sur vrai appareil

## Premiere preparation

A la racine du repo:

```powershell
pnpm install
pnpm setup:local
```

Cela prepare les fichiers `.env` locaux a partir des exemples.

## Demarrer la base PostgreSQL locale

1. Ouvrir Docker Desktop
2. Attendre qu il soit completement lance
3. Depuis le repo, lancer:

```powershell
pnpm db:start
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

Si `prisma:migrate` echoue, le premier reflexe est de verifier que Docker Desktop tourne bien et que le container PostgreSQL est demarre.

Mobilis utilise le port `5433` pour PostgreSQL afin d eviter les conflits avec un PostgreSQL deja installe sur la machine.

Le script `pnpm db:start` attend maintenant que PostgreSQL soit reellement pret avant de vous renvoyer la main.

## Voir l application sur le web

Le mode le plus simple:

```powershell
pnpm dev:full-web
```

Ensuite:

- Admin web: `http://localhost:3001`
- Rider web: URL Expo affichee dans le terminal, souvent `http://localhost:8081`
- Driver web: lancer separement avec `pnpm dev:web-driver-preview`

Important:

- en web Expo Metro, rider et driver ne doivent pas tourner en meme temps ici
- ils utilisent tous les deux le port `8081`
- gardez `dev:full-web` pour backend + admin + rider
- puis stoppez le rider avant de lancer le driver web

## Voir l application sur mobile

Lancer:

```powershell
pnpm dev:full-mobile
```

Puis:

1. Ouvrir Expo Go sur Android
2. Scanner le QR code du rider app ou du driver app
3. Verifier que le telephone et l ordinateur sont sur le meme Wi-Fi

## Comptes demo seedes

- `admin@mobilis.app`
- `driver@mobilis.app`
- `rider@mobilis.app`
- mot de passe commun: `Mobilis123!`

## Commandes utiles

- `pnpm dev:backend`
- `pnpm dev:admin`
- `pnpm dev:rider`
- `pnpm dev:driver`
- `pnpm dev:rider:web`
- `pnpm dev:driver:web`
- `pnpm dev:web-driver-preview`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter backend test -- --runInBand`

## Ordre conseille pour suivre l evolution

1. Ouvrir l admin web pour voir la vue operations et onboarding.
2. Ouvrir le rider app web ou mobile.
3. Ouvrir le driver app web ou mobile.
4. Garder un terminal pour le backend.

## Mon avis d expert

Pour un MVP beta, le meilleur rythme local est:

- `dev:full-web` pour les tests rapides backend + admin + rider web
- `dev:web-driver-preview` quand on veut verifier le driver web
- `dev:full-mobile` quand on veut valider les parcours reels Expo
- migrations Prisma appliquees des qu un changement de schema est introduit
- admin web comme console principale pour suivre l etat global du systeme

## Etat verifie

Au 18 avril 2026, ce setup local a ete reverifie avec succes sur:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter backend test -- --runInBand`
