# Orbi — Protocole de test terrain réel

**Objectif :** Valider le produit avec de vrais utilisateurs, de vrais téléphones, de vraies
données mobiles (Orange BF, Moov BF, Telecel BF), de vrais paiements mobile money.

---

## Vue d'ensemble du test

```
Poste de commande (toi, admin)
  │
  ├── Surveille le dashboard admin en direct
  ├── Valide les comptes chauffeurs
  └── Débriefe les problèmes en temps réel

Chauffeurs (2–4 téléphones)              Passagers (3–6 téléphones)
  │                                          │
  ├── App Orbi Chauffeur (APK)               ├── App Orbi Passager (APK)
  ├── Différents opérateurs                  ├── Différents opérateurs
  ├── Différentes zones de Ouaga            └── Différents quartiers
  └── Mode "en ligne"

         ↕  WebSocket (reconnexion auto, heartbeat 25s)

Backend NestJS (Render, Frankfurt)
  └── PostgreSQL (Neon, Frankfurt)
       ├── Données en direct
       ├── Dispatch automatique
       └── Paiements (PawaPay — Orange Money BF + Moov Money BF)
```

---

## Phase 0 — Préparation (J-1 ou matin du test)

### 0.1 Vérifier que le backend est vivant

```
GET https://orbi-field-api.onrender.com/api/v1/health/ready
→ {"status":"ready"}
```

Si le backend répond, le Cloudflare Worker le maintient éveillé. Sinon :
1. Ouvrir Render → orbi-field-api → Logs → identifier l'erreur
2. Vérifier que `DATABASE_URL` (Neon) est bien configurée

### 0.2 Construire les APKs terrain

**Prérequis :**
- Compte Expo sur [expo.dev](https://expo.dev) (compte `gbangou` déjà configuré)
- CLI EAS installé : `npm install -g eas-cli` (une seule fois)
- Connecté : `eas login` → entrer les identifiants du compte `gbangou`

**Option A — Build local recommandé sur ce poste**

```powershell
# À la racine du projet : génère rider + driver dans dist/
pnpm mobile:apk
```

Les APKs générés :
- `dist/orbi-rider-mvp.apk`
- `dist/orbi-driver-mvp.apk`

**Option B — EAS Build si le poste local n'est pas disponible**

```powershell
# Dans le terminal, à la racine du projet
cd apps/rider-app
eas build --profile field-test --platform android --non-interactive
```

```powershell
cd apps/driver-app
eas build --profile field-test --platform android --non-interactive
```

- Durée EAS : **8–15 minutes** par build environ (build sur serveurs Expo, pas sur ton PC)
- Suivi en direct sur [expo.dev/accounts/gbangou](https://expo.dev/accounts/gbangou) → Builds
- Une fois terminé : bouton **Download** → récupérer l'APK

> Le profil `field-test` pointe sur `https://orbi-field-api.onrender.com` — c'est le bon.

### 0.3 Distribuer les APKs

**Méthode simple : WhatsApp + Google Drive**

1. Uploader rider APK et driver APK dans Google Drive → Partager → "Accessible à tous avec le lien"
2. Envoyer le lien WhatsApp à chaque participant
3. Sur leur téléphone : ouvrir le lien Drive, télécharger l'APK, l'installer

**Attention à l'installation manuelle (APK) :**
- Android va bloquer l'installation par défaut
- Il faut autoriser "sources inconnues" : Paramètres → Sécurité → Installer des apps inconnues → Chrome (ou gestionnaire de fichiers) → Autoriser
- Faire ça sur chaque téléphone **avant** de donner le lien

### 0.4 Configurer les paiements

#### Option A : Test sans argent réel (recommandé pour le premier test)

Utiliser le mode cash uniquement — pas de setup paiement nécessaire.
- Dans l'app rider : sélectionner "Espèces" comme mode de paiement
- Le chauffeur reçoit l'argent en mains propres
- Permet de tester toute la logistique et l'UX sans rien configurer côté paiement

#### Option B : Mobile money en mode sandbox PawaPay (faux argent, vrai flow USSD)

Orbi utilise **PawaPay** — couverture native **Orange Money BF** et **Moov Money BF**.
Voir le guide complet : **[PAWAPAY_SETUP.md](PAWAPAY_SETUP.md)**

En résumé :
1. Créer un compte sur [dashboard.sandbox.pawapay.io](https://dashboard.sandbox.pawapay.io) (email uniquement)
2. Récupérer un token API et configurer le webhook
3. Dans Render : entrer `PAWAPAY_API_TOKEN`, `PAWAPAY_WEBHOOK_SECRET` (déjà `sandbox`)
4. Tester avec les numéros sandbox PawaPay (simulateur USSD automatique)

#### Option C : Vrai argent réel (PawaPay production)

Nécessite un compte PawaPay production avec vérification KYC (RCCM, CNIB, compte bancaire).
Délai d'approbation : 3–10 jours ouvrables. Voir [PAWAPAY_SETUP.md](PAWAPAY_SETUP.md).
**Ne jamais passer en production avant d'avoir validé le flow en mode sandbox.**

---

## Phase 1 — Inscription des participants (J-0, 1h avant le test)

### Comptes chauffeurs

Pour chaque chauffeur :
1. Installer l'APK Orbi Chauffeur
2. S'inscrire avec leur vrai numéro de téléphone
3. Remplir leur profil chauffeur
4. Uploader les documents demandés (photo CNI, permis, photo du moto/véhicule)
5. **Toi (admin)** : ouvrir le dashboard admin → Chauffeurs → valider les documents de chaque chauffeur
6. Une fois validé, le chauffeur peut passer en mode "disponible"

> **Gain de temps :** créer les comptes chauffeurs la veille et valider leurs documents avant le test.
> Le seed (`prisma:seed`) peut aussi créer des comptes de test pré-validés.

### Comptes passagers

Pour chaque passager :
1. Installer l'APK Orbi Passager
2. S'inscrire avec leur vrai numéro de téléphone
3. Profil créé — prêt à commander

---

## Phase 2 — Test à blanc (entre toi et 1 chauffeur + 1 passager, sans pression)

**Objectif :** Vérifier que tout fonctionne avant de mobiliser tout le monde.

**Scénario test à blanc :**
1. Chauffeur passe en ligne → apparaît en vert dans le dashboard admin
2. Passager ouvre l'app → entre une destination → commande une course
3. Chauffeur reçoit la notification → accepte
4. Passager voit "Chauffeur en route"
5. Chauffeur arrive → passager monte → confirme le démarrage
6. Course terminée → notation mutuelle
7. Admin vérifie : la course apparaît dans le dashboard, les données sont en base

**Ce qu'il faut vérifier :**
- [ ] La localisation du chauffeur se met à jour (icône bouge sur la carte)
- [ ] Le passager reçoit la mise à jour "Chauffeur en route" en moins de 10s
- [ ] Le chauffeur reçoit l'offre sans délai notable
- [ ] La connexion WebSocket survit sur 4G/3G (pas juste WiFi)
- [ ] Le paiement cash fonctionne (ou test USSD si configuré)

---

## Phase 3 — Test terrain complet

### Répartition des participants

| Rôle | Nombre | Opérateurs à couvrir | Zones de Ouaga |
|------|--------|----------------------|----------------|
| Chauffeurs | 2–4 | Orange, Moov, Telecel | Centre, Pissy, Gounghin, Sig-Nonghin |
| Passagers | 4–8 | Orange, Moov, Telecel | Différents quartiers |
| Admin (toi) | 1 | Peu importe | Fixe, avec laptop |

> Objectif : couvrir les 3 opérateurs majeurs sur au moins 2 zones géographiques différentes.

### Script du test (durée : 2–3 heures)

**Heure 0:00 — Lancement**
- Tous les chauffeurs passent en ligne simultanément
- Vérifier dans le dashboard admin que tous apparaissent
- Premier passager commande une course depuis Zone A

**Heure 0:10 — Première série de courses**
- 3–4 commandes simultanées depuis des positions différentes
- Observer : quel chauffeur est assigné à quelle demande ?
- Observer : temps entre commande et affectation d'un chauffeur

**Heure 0:45 — Test d'opérateurs spécifiques**
- Une course avec passager sur Orange, chauffeur sur Moov → vérifier le temps réel
- Une course avec passager sur Telecel → vérifier que la connexion WebSocket tient

**Heure 1:30 — Test de réseau difficile**
- Demander à un chauffeur de se mettre dans une zone à signal faible
- Vérifier que son app se reconnecte automatiquement (max 30s)
- Si le chauffeur disparaît du dashboard et revient → reconnexion OK

**Heure 2:00 — Test paiement (si configuré)**
- 2–3 courses avec paiement mobile money
- Passager reçoit notif USSD → confirme → chauffeur voit le paiement reçu
- Vérifier côté admin : transaction enregistrée en base

**Heure 2:30 — Test scénarios d'erreur**
- Passager commande mais annule → chauffeur voit l'annulation en temps réel
- Chauffeur refuse une offre → offre part à un autre chauffeur
- Passager commande et personne n'est disponible → message d'erreur correct

### Ce que tu surveilles en direct (dashboard admin)

Pendant tout le test, le dashboard admin doit montrer :
- La carte avec les chauffeurs en temps réel
- Les courses en cours
- Les transactions (paiements)
- Les erreurs éventuelles

**URL admin :** `https://orbi-XXXXXX.vercel.app` (ton URL Vercel)

---

## Phase 4 — Débriefing immédiat (après le test)

### Questions à poser aux chauffeurs
1. L'app a-t-elle rammé ou planté ?
2. Les notifications d'offre arrivaient-elles rapidement ?
3. La localisation du passager était-elle correcte ?
4. La connexion a-t-elle coupé ? Si oui, ça s'est reconnecté tout seul ?
5. Quoi améliorer en priorité ?

### Questions à poser aux passagers
1. La commande était-elle facile ?
2. Avez-vous eu des erreurs ?
3. Savez-vous où était le chauffeur à tout moment ?
4. Le paiement a-t-il fonctionné ?
5. Recommanderiez-vous l'app à un ami aujourd'hui ?

### Ce que tu analyses après le test (base de données)

Dans Neon → Tables ou SQL Editor :
```sql
-- Courses complétées
SELECT COUNT(*) FROM trips WHERE status = 'COMPLETED';

-- Temps moyen entre commande et affectation chauffeur
SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_dispatch_seconds
FROM ride_requests WHERE status = 'MATCHED';

-- Erreurs de connexion (logs WebSocket backend)
-- Voir Render → Logs

-- Paiements réussis vs échoués
SELECT status, COUNT(*) FROM payment_attempts GROUP BY status;
```

---

## Problèmes courants et solutions immédiates

### "L'app rider ne peut pas s'installer"

**Cause :** Android bloque les APKs hors Play Store.

**Solution :**
1. Paramètres Android → Sécurité
2. "Installer des apps inconnues" ou "Sources inconnues"
3. Chercher l'app qui a téléchargé l'APK (Chrome, Gestionnaire de fichiers)
4. Activer l'autorisation pour cette app
5. Reinstaller l'APK

### "Le chauffeur a disparu de la carte"

**Cause :** Déconnexion WebSocket (perte de réseau temporaire).

**Solution :**
- Attendre 30s → reconnexion automatique
- Si ça ne revient pas : chauffeur ferme et rouvre l'app
- Si toujours rien : vérifier que le backend Render est vivant

### "Erreur 'Impossible de commander'"

**Causes possibles :**
1. Backend endormi (Render free tier) → vérifier `/health/ready`
2. Token de session expiré → se déconnecter et reconnecter dans l'app
3. Aucun chauffeur disponible dans la zone

### "Le paiement ne part pas"

**Causes possibles :**
1. `PAWAPAY_API_TOKEN` absent ou invalide dans Render → vérifier les variables d'environnement
2. Numéro de téléphone invalide pour le mobile money (doit être 8+ chiffres, sans espace)
3. `PAWAPAY_ENVIRONMENT=sandbox` mais token de production utilisé (ou inversement)
4. Solde insuffisant (uniquement en mode production avec vrai argent)

**Pour le test :** basculer en paiement cash → la course continue sans le paiement.

### "Trop de latence entre la commande et l'affichage"

**Cause probable :** Backend sur Render (Frankfurt) + réseau mobile → latence normale 200–500ms.

**Ce qui est normal :**
- Commande → affichage chez le chauffeur : < 5 secondes
- Mise à jour position chauffeur : toutes les 3–5 secondes

Si c'est plus long, regarder les logs Render pour identifier les requêtes lentes.

---

## Métriques de succès du test terrain

| Métrique | Seuil acceptable | Excellent |
|----------|-----------------|-----------|
| Dispatch (commande → chauffeur assigné) | < 10s | < 5s |
| Reconnexion WebSocket après coupure | < 30s | < 10s |
| Taux de completion des courses | > 70% | > 90% |
| Crashes app pendant le test | < 2 | 0 |
| Avis "je réutiliserais ça" | > 60% | > 80% |

---

## Notes importantes pour Burkina Faso

### Opérateurs mobiles couverts
- **Orange Burkina Faso** : meilleure couverture Ouaga, 4G disponible en centre-ville
- **Moov Africa BF** : bonne couverture, populaire, souvent plus économique
- **Telecel BF** (ex-Airtel) : couverture plus limitée, mais présent

### WebSocket sur données mobiles africaines
Les apps ont été conçues spécifiquement pour ça :
- Heartbeat toutes les 25 secondes (évite le timeout des proxies opérateurs)
- Reconnexion automatique si la connexion coupe (feux de circulation, tunnels de l'Ouaga, zones mortes)
- Maximum 30 secondes pour se reconnecter

### Paiements mobile money
Orbi utilise **PawaPay** (couverture native Orange BF + Moov BF).
- **Sandbox** : compte créé en 2 minutes sur dashboard.sandbox.pawapay.io, aucun document
- **Production** : KYC requis (RCCM, CNIB, compte bancaire) — délai 3 à 10 jours ouvrables
- Guide complet : [PAWAPAY_SETUP.md](PAWAPAY_SETUP.md)

### Données GPS en outdoor
Ouagadougou a une bonne couverture GPS outdoor. Les problèmes GPS (signal lent) arrivent :
- Dans les bâtiments (marché couvert, centres commerciaux)
- Au démarrage de l'app (cold start GPS peut prendre 20–30s)
- Demander aux testeurs d'être en extérieur pour le test

---

## Résumé des commandes importantes

```powershell
# Construire le rider APK (cloud, pas local)
cd apps/rider-app
eas build --profile field-test --platform android

# Construire le driver APK (cloud, pas local)  
cd apps/driver-app
eas build --profile field-test --platform android

# Vérifier le backend en direct
curl https://orbi-field-api.onrender.com/api/v1/health/ready

# Voir les logs du backend en direct
# → Render dashboard → orbi-field-api → Logs

# Relancer le seed (si besoin de recréer les données de test)
# → Render dashboard → orbi-field-api → Shell
# pnpm --filter backend prisma:seed
```
