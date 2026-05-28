# Orbi staging public pour APK terrain

Cette configuration sert a exposer le backend Orbi avec une URL HTTPS stable,
par exemple `https://api-staging.orbi.example`, afin que les APK Android
fonctionnent sur des telephones reels en data mobile independante.

Ce n'est pas un tunnel. Le backend tourne sur un serveur public avec PostgreSQL
et Caddy gere automatiquement le certificat HTTPS.

## Prerequis

- Un VPS Ubuntu/Debian avec Docker et Docker Compose.
- Deux sous-domaines, par exemple `api-staging.orbi.example` et
  `admin-staging.orbi.example`.
- Le DNS des deux sous-domaines pointe vers l'IP publique du VPS.
- Les ports `80` et `443` sont ouverts.

## Installation sur le VPS

Depuis le serveur:

```bash
git clone <repo-orbi> orbi
cd orbi/deploy/staging
cp .env.example .env
nano .env
```

Changer au minimum:

- `ORBI_API_DOMAIN`
- `ORBI_ADMIN_DOMAIN`
- `POSTGRES_PASSWORD`
- `PAYMENTS_WEBHOOK_SECRET`
- `DOCUMENT_SIGNING_SECRET`
- `FRONTEND_ALLOWED_ORIGINS`

Puis lancer:

```bash
docker compose up -d --build
```

Ou utiliser le script de deploiement avec controle automatique:

```bash
sh ./deploy-staging.sh
```

Initialiser les donnees de base du pilote ferme:

```bash
docker compose run --rm seed
```

Ou avec le script:

```bash
RUN_SEED=true sh ./deploy-staging.sh
```

Verifier:

```bash
curl -i https://$ORBI_API_DOMAIN/api/v1/health/ready
curl -I https://$ORBI_ADMIN_DOMAIN
```

Le resultat API doit etre `HTTP/2 200` avec `status: ready`.
Le resultat admin doit etre un statut non-erreur.

## Build des APK terrain

Depuis le PC de dev, quand l'URL publique repond en `200`:

```powershell
pnpm field:api:check --ApiUrl https://api-staging.orbi.example --AdminUrl https://admin-staging.orbi.example
pnpm mobile:field --ApiUrl https://api-staging.orbi.example --App all --Profile mvp
```

Les APK generes par EAS embarquent cette URL HTTPS. Ils pourront donc parler au
backend depuis deux telephones differents en 4G/5G, sans etre sur le meme Wi-Fi.

La console operations est accessible sur:

```text
https://admin-staging.orbi.example
```

## Mise a jour backend

Sur le VPS:

```bash
git pull
cd deploy/staging
docker compose up -d --build
```

Ou:

```bash
sh ./deploy-staging.sh
```

Les migrations Prisma sont lancees par le service `migrate` avant le backend.

## Sauvegarde rapide avant test terrain

Sur le VPS, depuis `deploy/staging`:

```bash
sh ./backup-postgres.sh
```

Le dump compresse est place dans `deploy/staging/backups`.
