# Live Preview

Ce fichier explique comment suivre Mobilis en direct sur le web et sur Android pendant que le projet avance.

## Ports

- backend NestJS: `http://localhost:3000`
- admin web Next.js: `http://localhost:3001`
- PostgreSQL local Docker: `localhost:5433`
- rider app web Expo: selon Expo, generalement `http://localhost:8081` ou le port affiche dans le terminal
- driver app web Expo: a lancer separement apres le rider avec `pnpm dev:web-driver-preview`

## Variables d'environnement

Copier si necessaire:

- `apps/backend/.env.example` vers `apps/backend/.env`
- `apps/admin-web/.env.example` vers `apps/admin-web/.env.local`
- `apps/rider-app/.env.example` vers `apps/rider-app/.env`
- `apps/driver-app/.env.example` vers `apps/driver-app/.env`

## Lancer la stack principale

Avant le premier lancement:

```bash
pnpm setup:local
pnpm db:start
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

Le script `pnpm db:start` attend maintenant que PostgreSQL soit pret avant de terminer.

### Apercu web rapide

```bash
pnpm dev:web-preview
```

Cela lance:

- le backend
- l'admin web
- le rider app en mode web

### Apercu web principal admin + rider

```bash
pnpm dev:full-web
```

Cela lance:

- le backend
- l admin web
- le rider app web

### Apercu web driver

```bash
pnpm dev:web-driver-preview
```

Cela lance:

- le backend
- l admin web
- le driver app web

### Apercu mobile Android + web

```bash
pnpm dev:full-mobile
```

Cela lance:

- le backend
- l'admin web
- le rider app Expo
- le driver app Expo

Ensuite:

1. Ouvrir `http://localhost:3001` pour suivre le dashboard admin et la progression du build.
2. Dans le terminal Expo, scanner le QR code avec Expo Go sur Android.
3. Scanner aussi le QR code du driver app pour voir l experience chauffeur.
4. Si besoin, ouvrir aussi la version web Expo depuis l'URL affichee par Expo.

## Rider et driver separement

```bash
pnpm dev:rider
pnpm dev:driver
pnpm dev:rider:web
pnpm dev:driver:web
```

## Ce que tu peux deja voir

- le dashboard admin premium
- une section de progression du build dans l'admin
- le rider app sur web et Android
- le driver app sur web et Android

## Comptes demo

- `admin@mobilis.app`
- `driver@mobilis.app`
- `rider@mobilis.app`
- mot de passe: `Mobilis123!`

## Note importante

Pour Android, il faut que ton telephone et ton ordinateur soient sur le meme reseau Wi-Fi pour le flux Expo le plus simple.

Pour le web Expo Metro de ce repo, rider et driver ne tournent pas ensemble:

- ils utilisent tous les deux Metro sur `8081`
- lancer les deux en parallele fait echouer le second avec `EADDRINUSE`
- il faut tester rider puis driver, chacun dans sa propre session
