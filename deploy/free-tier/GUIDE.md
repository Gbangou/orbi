# Orbi — Déploiement terrain gratuit (sans carte bancaire)

**Objectif :** Avoir un backend réel, une base de données réelle, et un panel d'administration
accessibles depuis internet — gratuitement — pour les tests terrain à Ouagadougou.

**Stack retenu (100 % gratuit, sans carte bancaire) :**

| Composant | Service | Quota gratuit |
|-----------|---------|---------------|
| Base de données PostgreSQL | Neon | Free tier, quotas à surveiller |
| Backend NestJS API | Render | Free web service, 750 h/mois, cold starts possibles |
| Admin web Next.js | Vercel | Hobby plan, limites Vercel à surveiller |
| Keep-alive + collecte erreurs | Cloudflare Workers | Quotas gratuits Cloudflare à surveiller |
| CI/CD | GitHub Actions | Quotas gratuits GitHub à surveiller |

**Durée estimée de la mise en place : 45–90 minutes.**

---

## Étape 0 — Pousser le code sur GitHub

> Si le dépôt GitHub n'existe pas encore :

1. Aller sur [github.com](https://github.com) → **New repository**
2. Nommer le dépôt `orbi` (privé recommandé)
3. Ne pas initialiser avec README (le code existe déjà)
4. Dans le terminal, à la racine du projet :

```powershell
git remote add origin https://github.com/TON-USERNAME/orbi.git
git push -u origin main
```

> Si le dépôt existe déjà, juste :
```powershell
git push origin main
```

---

## Étape 1 — Base de données : Neon

Neon donne une vraie base PostgreSQL hébergée, accessible depuis Render, sans carte bancaire
sur son plan gratuit.

### 1.1 Créer le compte

1. Aller sur [neon.tech](https://neon.tech)
2. **Sign up** avec GitHub (le plus rapide) ou email
3. Pas de carte bancaire demandée

### 1.2 Créer le projet

1. Cliquer **New project**
2. Choisir l'organisation (la vôtre, créée automatiquement)
3. Remplir :
   - **Project name :** `Orbi`
   - **Postgres version :** conserver la version proposée par Neon
   - **Region :** choisir `AWS Europe Central 1 (Frankfurt)` si disponible
4. Cliquer **Create new project** — attendre ~2 minutes

### 1.3 Récupérer la chaîne de connexion

1. Dans le projet Neon → **Dashboard** → **Connection details**
2. Sélectionner la branche de production et la base `neondb`
3. Copier la **Connection string**, qui ressemble à :
   ```
   postgresql://neondb_owner:********@ep-xxxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Cliquer **Show password** si nécessaire, copier l'URL complète, puis la conserver
   hors Git — elle sera collée dans Render à l'étape 2.

---

## Étape 2 — Backend API : Render

Render héberge le serveur NestJS. Le `render.yaml` à la racine du projet configure tout
automatiquement.

### 2.1 Créer le compte

1. Aller sur [render.com](https://render.com)
2. **Get Started for Free** → se connecter avec GitHub
3. Pas de carte bancaire pour le plan gratuit

### 2.2 Créer le service Web

1. Dans le dashboard Render → **New +** → **Blueprint**
2. Sélectionner le dépôt GitHub `orbi`
3. Render va lire le `render.yaml` et proposer de créer le service `orbi-field-api`
4. Cliquer **Apply** — Render crée le service

### 2.3 Configurer les variables d'environnement

Dans **Dashboard → orbi-field-api → Environment** :

Ajouter les variables suivantes (elles sont marquées `sync: false` dans le YAML) :

| Variable | Valeur | Quand renseigner |
|----------|--------|-----------------|
| `DATABASE_URL` | URL Neon (étape 1.3) | Maintenant |
| `FRONTEND_ALLOWED_ORIGINS` | URL Vercel de l'admin | Après étape 4 |
| `MOBILE_ERROR_COLLECTOR_WEBHOOK_URL` | URL Cloudflare Worker + `/mobile-errors` | Après étape 3 |
| `PAWAPAY_API_TOKEN` | Token JWT PawaPay dashboard | Après étape 2.5 |
| `PAWAPAY_WEBHOOK_SECRET` | Secret HMAC PawaPay dashboard | Après étape 2.5 |

Les variables `PAYMENTS_WEBHOOK_SECRET` et `DOCUMENT_SIGNING_SECRET` sont générées
automatiquement par Render (`generateValue: true`) — ne pas les toucher.

### 2.5 Configurer PawaPay (paiements Mobile Money)

Orbi utilise **PawaPay** pour Orange Money BF et Moov Money BF. Sans cette configuration,
les paiements fonctionnent quand même en mode **espèces** (option par défaut).

**Pour activer les paiements Mobile Money :**

1. Aller sur [dashboard.sandbox.pawapay.io](https://dashboard.sandbox.pawapay.io) → créer un compte (email uniquement, sans documents)
2. **Developers → API Tokens → Generate Token** → copier le token JWT
3. **Webhooks → Add Webhook** → entrer l'URL :
   ```
   https://orbi-field-api.onrender.com/api/v1/payments/webhooks/pawapay
   ```
4. Copier le **Webhook Secret** généré
5. Dans Render → Environment : ajouter `PAWAPAY_API_TOKEN` et `PAWAPAY_WEBHOOK_SECRET`
6. `PAWAPAY_ENVIRONMENT` est déjà configuré à `sandbox` dans `render.yaml`

**→ Guide complet avec chaque clic : [PAWAPAY_SETUP.md](PAWAPAY_SETUP.md)**

### 2.4 Premier déploiement

1. Render commence le build automatiquement — compter **8–15 minutes** pour le premier build
2. Suivre les logs dans **Logs** → tout doit se terminer par :
   ```
   Starting server on 0.0.0.0:3000
   ```
3. Vérifier que l'API est vivante :
   ```
   https://orbi-field-api.onrender.com/api/v1/health/ready
   ```
   La réponse doit être `{"status":"ready"}`.

> **Note sur le plan gratuit Render :** Render peut arrêter un web service gratuit
> après une période d'inactivité et le redémarrage peut prendre environ une minute.
> Le Worker Cloudflare réduit ce risque avec un ping régulier, mais ne remplace pas
> un plan payant pour une production ouverte au public.

---

## Étape 3 — Keep-alive + Collecte d'erreurs : Cloudflare Workers

Le Worker remplit deux rôles :
- **Keep-alive :** ping le backend toutes les 10 minutes pour limiter les cold starts
- **Sink d'erreurs :** reçoit les rapports d'erreur et retourne un accusé de réception

### 3.1 Créer le compte Cloudflare

1. Aller sur [cloudflare.com](https://www.cloudflare.com)
2. **Sign Up** → email + mot de passe
3. Plan **Free** — pas de carte bancaire

### 3.2 Déployer le Worker (méthode manuelle — sans outil CLI)

1. Dashboard Cloudflare → **Workers & Pages** → **Create**
2. Choisir **Create Worker**
3. Nommer le Worker : `orbi-utils`
4. Cliquer **Deploy** (avec le code Hello World par défaut)
5. Cliquer **Edit code** sur la page suivante
6. **Remplacer tout le contenu** par celui du fichier :
   `deploy/free-tier/cloudflare-worker/index.js`
7. Cliquer **Save and deploy**
8. Copier l'URL du Worker, qui ressemble à :
   ```
   https://orbi-utils.TON-SOUS-DOMAINE.workers.dev
   ```

### 3.3 Ajouter le trigger cron (keep-alive)

1. Dans la page du Worker → onglet **Triggers**
2. Section **Cron Triggers** → **Add Cron Trigger**
3. Entrer : `*/10 * * * *`
4. Cliquer **Add Trigger**

### 3.4 Mettre à jour Render avec l'URL du Worker

Dans **Render → orbi-field-api → Environment** :

```
MOBILE_ERROR_COLLECTOR_WEBHOOK_URL = https://orbi-utils.TON-SOUS-DOMAINE.workers.dev/mobile-errors
```

Cliquer **Save Changes** → Render redémarre le service avec la nouvelle valeur.

---

## Étape 4 — Admin web : Vercel

Vercel héberge le dashboard administrateur Next.js.

### 4.1 Créer le compte

1. Aller sur [vercel.com](https://vercel.com)
2. **Sign Up** → continuer avec GitHub
3. Plan **Hobby** — gratuit, sans carte bancaire

### 4.2 Importer le projet

1. Dashboard Vercel → **Add New... → Project**
2. Chercher et sélectionner le dépôt `orbi`
3. Section **Configure Project** :
   - **Framework Preset :** Next.js (auto-détecté)
   - **Root Directory :** Cliquer **Edit** → entrer `apps/admin-web`
4. Section **Environment Variables** : ajouter :
   ```
   NEXT_PUBLIC_API_BASE_URL = https://orbi-field-api.onrender.com
   NEXT_PUBLIC_API_VERSION = v1
   ```
5. Cliquer **Deploy** — compter 3–5 minutes

### 4.3 Récupérer l'URL de l'admin

Une fois déployé, Vercel donne une URL de type :
```
https://orbi-XXXXXX.vercel.app
```
(ou un nom personnalisé si choisi)

### 4.4 Mettre à jour Render avec l'URL Vercel

Dans **Render → orbi-field-api → Environment** :

```
FRONTEND_ALLOWED_ORIGINS = https://orbi-XXXXXX.vercel.app
```

Cliquer **Save Changes** → Render redémarre.

---

## Étape 5 — Mettre à jour les applications mobiles

Les APK doivent pointer vers le vrai backend Render, pas localhost.

### 5.1 Rider App

Modifier `apps/rider-app/.env` (ou créer `.env.local`) :
```env
EXPO_PUBLIC_API_BASE_URL=https://orbi-field-api.onrender.com
EXPO_PUBLIC_API_VERSION=v1
```

### 5.2 Driver App

Modifier `apps/driver-app/.env` :
```env
EXPO_PUBLIC_API_BASE_URL=https://orbi-field-api.onrender.com
EXPO_PUBLIC_API_VERSION=v1
```

### 5.3 Reconstruire les APKs

```powershell
# Les deux APKs sont générés localement et pointent vers Render par défaut.
pnpm mobile:apk

# Variante ciblée si tu veux seulement reconstruire une app :
pnpm mobile:apk:rider
pnpm mobile:apk:driver
```

---

## Étape 6 — Charger les données initiales

Le backend exécute `prisma migrate deploy` puis `prisma:seed` automatiquement pendant
le build Render. C'est volontaire pour rester compatible avec le plan gratuit Render,
qui ne supporte pas toujours les hooks de pré-déploiement.

Pour vérifier ou relancer manuellement depuis Render :
1. **Dashboard → orbi-field-api → Shell** (onglet en haut)
2. Taper :
   ```bash
   pnpm --filter backend prisma:seed
   ```

---

## Étape 7 — Vérification complète

### Checklist avant le test terrain

- [ ] `https://orbi-field-api.onrender.com/api/v1/health/ready` → `{"status":"ready"}`
- [ ] Admin web accessible et affiche le dashboard (pas d'erreur CORS)
- [ ] APK driver installé sur au moins un téléphone de test
- [ ] APK rider installé sur au moins un téléphone de test
- [ ] Créer un compte chauffeur depuis l'app driver → apparaît dans l'admin
- [ ] Créer une demande de course depuis l'app rider → le chauffeur la reçoit en temps réel

### Vérifier la base de données

Dans **Neon → Tables** ou **SQL Editor** : les tables `users`, `driver_profiles`,
`rider_profiles`, etc. doivent être visibles et contenir les données du seed.

---

## Architecture réelle en place

```
┌──────────────────────────────────────────────────────────┐
│  Téléphones terrain (Ouagadougou)                        │
│  ┌────────────────┐    ┌────────────────┐               │
│  │  APK Rider     │    │  APK Driver    │               │
│  │ (Android)      │    │ (Android)      │               │
│  └───────┬────────┘    └───────┬────────┘               │
└──────────┼─────────────────────┼──────────────────────  │
           │   HTTPS / WebSocket │                        │
           ▼                     ▼                        │
┌──────────────────────────────────────┐                  │
│  Render (Frankfurt)                  │                  │
│  Backend NestJS — orbi-field-api     │                  │
│  • API REST /api/v1/...              │                  │
│  • WebSocket temps réel (dispatch)   │                  │
│  • Job queue (paiements, notifs)     │                  │
│  • Gestion documents chauffeurs      │                  │
└──────────────┬───────────────────────┘                  │
               │ PostgreSQL (Prisma)                       │
               ▼                                           │
┌──────────────────────────────────────┐                  │
│  Neon (Frankfurt)                    │                  │
│  PostgreSQL 15                       │                  │
│  • Toutes les données utilisateurs   │                  │
│  • Courses, paiements, wallets       │                  │
│  • Logs d'audit, tickets support     │                  │
│  • File d'attente des jobs           │                  │
└──────────────────────────────────────┘                  │
                                                           │
┌──────────────────────────────────────┐                  │
│  Cloudflare Workers                  │                  │
│  • Keep-alive cron (*/10 * * * *)    │                  │
│  • Collecte erreurs mobiles          │                  │
└──────────────────────────────────────┘                  │
                                                           │
┌──────────────────────────────────────┐                  │
│  Vercel (admin)                      │                  │
│  Next.js — dashboard administrateur  │                  │
│  • Validation chauffeurs             │                  │
│  • Suivi courses en direct           │                  │
│  • Gestion paiements et wallets      │                  │
└──────────────────────────────────────┘
```

---

## Limites du plan gratuit à connaître

| Limite | Impact | Solution si nécessaire |
|--------|--------|------------------------|
| Render free web service | Cold start, limite mensuelle d'heures, pas de disque persistant | Plan payant quand le pilote devient public |
| Base PostgreSQL gratuite | Quotas stockage/compute variables selon fournisseur | Sauvegardes et monitoring avant un vrai lancement |
| Cloudflare Workers gratuit | Quotas gratuits à surveiller | Plan payant si trafic élevé |
| Vercel Hobby | Limites d'usage/build à surveiller | Pro si équipe, trafic ou domaine critique |

---

## Déploiement automatique (après la mise en place)

Une fois GitHub connecté à Render et Vercel :
- **Chaque `git push` sur `main`** déclenche le redéploiement si Render/Vercel sont bien connectés au dépôt
- Les migrations Prisma et le seed idempotent sont appliqués automatiquement pendant le build
- Zéro intervention manuelle pour les mises à jour

---

## En cas de problème

### Le backend ne démarre pas
```
# Vérifier les logs Render → chercher l'erreur de validation d'environnement
# Les erreurs courantes :
# - DATABASE_URL manquante → vérifier l'étape 2.3
# - FRONTEND_ALLOWED_ORIGINS invalide → s'assurer qu'elle ne contient pas localhost
# - MOBILE_ERROR_COLLECTOR_WEBHOOK_URL invalide → vérifier l'URL Cloudflare (HTTPS requis)
```

### Erreur CORS depuis l'admin web
```
# Render → Environment → FRONTEND_ALLOWED_ORIGINS
# Doit être exactement l'URL Vercel : https://orbi-XXXXXX.vercel.app
# Sans slash final, sans localhost
```

### Les WebSockets ne fonctionnent pas (temps réel)
```
# Vérifier que REALTIME_ADAPTER=postgres et REALTIME_STRICT=true dans Render
# Render supporte les WebSockets sur le plan gratuit
```

### Le backend s'endort quand même
```
# Vérifier dans Cloudflare Workers → Logs → que les pings toutes les 10 min arrivent
# Si le Worker ne s'est pas encore déclenché, forcer depuis Triggers → Run Now
# Pour une garantie opérationnelle réelle, passer Render sur un plan payant.
```
