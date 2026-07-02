# PawaPay — Guide d'intégration complet
## Orbi · Paiements Mobile Money Burkina Faso

**PawaPay** est une API mobile money spécialisée en Afrique subsaharienne. Elle supporte
**Orange Money BF (ORANGE_BFA)** et **Moov Money BF (MOOV_BFA)** en Burkina Faso.

---

## Comment fonctionne PawaPay dans Orbi

```
Passager (app Orbi) → choisit "Mobile Money" + numéro Orange/Moov
        │
        ▼
Backend Orbi → POST /v1/deposits à api.pawapay.io (ou sandbox)
        │
        ▼
PawaPay → envoie notification USSD au téléphone du passager
        │
        ▼
Passager → confirme avec son code PIN Orange Money / Moov Money
        │
        ▼
PawaPay → POST webhook à https://orbi-field-api.onrender.com/api/v1/payments/webhooks/pawapay
        │
        ▼
Backend Orbi → vérifie HMAC → marque paiement comme réussi → crédite wallet chauffeur
```

**Aucune WebView. Aucune redirection navigateur. Tout se passe dans l'app.**

---

## Phase 1 — Compte Sandbox (tests sans argent réel)

Le sandbox PawaPay simule des paiements Orange Money / Moov Money sans débiter de vrais comptes.
Idéal pour vérifier que tout fonctionne avant de passer en production.

### Étape 1 — Créer le compte sandbox

1. Ouvrir : **[dashboard.sandbox.pawapay.io](https://dashboard.sandbox.pawapay.io)**

2. Cliquer **Sign Up**

3. Remplir le formulaire :
   - **Company name** : `Orbi Technologies` (ou ton nom)
   - **Email** : ton email (ex. bonaloue@gmail.com)
   - **Password** : choisir un mot de passe fort
   - **Country** : Burkina Faso
   - **Currency** : XOF

4. Cliquer **Create Account**

5. Vérifier l'email reçu → cliquer le lien de confirmation

6. Connexion au dashboard sandbox

---

### Étape 2 — Récupérer le Token API (sandbox)

1. Dans le dashboard sandbox, aller dans le menu : **Developers** → **API Tokens**

   *(ou chercher "API" dans la barre de recherche du menu)*

2. Cliquer **Generate Token** (ou **New Token**)

3. Nommer le token : `orbi-field-api`

4. Cliquer **Generate**

5. **COPIER le token immédiatement** — il ne sera plus visible après fermeture
   - Le token ressemble à un long JWT : `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ...`

6. → Cette valeur ira dans `PAWAPAY_API_TOKEN` sur Render

---

### Étape 3 — Configurer l'URL webhook dans le dashboard PawaPay

C'est ici que PawaPay saura où envoyer les confirmations de paiement.

1. Dans le dashboard sandbox → menu **Webhooks** (ou **Developers** → **Webhooks**)

2. Cliquer **Add Webhook** (ou **Configure Webhook**)

3. Remplir :
   - **URL** : `https://orbi-field-api.onrender.com/api/v1/payments/webhooks/pawapay`
   - **Events** : sélectionner **DEPOSIT** et **REFUND** (ou "All events" si disponible)

4. Cliquer **Save**

5. Le dashboard génère un **Webhook Secret** (ou "Signing Secret")
   - Cliquer pour l'afficher / le copier
   - → Cette valeur ira dans `PAWAPAY_WEBHOOK_SECRET` sur Render

---

### Étape 4 — Renseigner les variables dans Render

Dans **Render → orbi-field-api → Environment**, ajouter / mettre à jour :

| Variable | Valeur |
|----------|--------|
| `PAWAPAY_API_TOKEN` | Le token JWT copié à l'étape 2 |
| `PAWAPAY_WEBHOOK_SECRET` | Le secret webhook copié à l'étape 3 |
| `PAWAPAY_ENVIRONMENT` | `sandbox` |

Cliquer **Save Changes** → Render redémarre le service.

---

### Étape 5 — Tester avec des numéros sandbox

PawaPay sandbox a des numéros de test prédéfinis pour simuler le comportement :

**Orange Money BF (ORANGE_BFA) — numéros sandbox :**

| Numéro | Comportement simulé |
|--------|---------------------|
| `226700000001` | Paiement réussi (COMPLETED) |
| `226700000002` | Paiement échoué (FAILED) |
| `226700000003` | Timeout USSD (pas de réponse) |

**Moov Money BF (MOOV_BFA) — numéros sandbox :**

| Numéro | Comportement simulé |
|--------|---------------------|
| `226600000001` | Paiement réussi (COMPLETED) |
| `226600000002` | Paiement échoué (FAILED) |

> **Note :** Les numéros exacts peuvent varier. Les vérifier dans :
> Dashboard sandbox → **Developers** → **Test Numbers** (ou **Simulators**)

**Scénario de test complet en sandbox :**

1. Ouvrir l'app rider (APK field-test)
2. Commander une course
3. Sélectionner **Mobile Money** → choisir **Orange Money**
4. Entrer le numéro sandbox : `700000001` (code pays +226 déjà présent dans l'app)
5. Confirmer la commande
6. Le backend envoie une requête à PawaPay sandbox
7. PawaPay sandbox simule la confirmation USSD automatiquement (en quelques secondes)
8. Le backend reçoit le webhook → la course est marquée payée
9. Vérifier dans Neon → table `payment_attempts` → statut `SUCCEEDED`

---

## Phase 2 — Compte Production (vrai argent)

### Ce qu'il faut pour le compte production

PawaPay exige pour la production :

1. **Numéro de registre de commerce (RCCM)** ou équivalent légal burkinabè
2. **Pièce d'identité** du représentant légal (CNIB ou passeport)
3. **Coordonnées bancaires** pour les virements de sortie (compte UBA, Coris, SGBF, etc.)
4. **Preuve d'adresse** (facture récente, etc.)

> Le compte de test sandbox fonctionne **sans aucun document**. La vérification KYC n'est
> nécessaire que pour le passage en production.

### Étape 1 — Créer le compte production

1. Ouvrir : **[dashboard.pawapay.io](https://dashboard.pawapay.io)** *(pas sandbox)*

2. Cliquer **Sign Up**

3. Même processus que le sandbox, mais avec les vrais documents

4. Soumettre les documents pour vérification KYC

5. Délai d'approbation : **3 à 10 jours ouvrables**

6. PawaPay vous contactera par email pour confirmer l'activation

### Étape 2 — Récupérer le Token production

Même procédure que sandbox : **Developers → API Tokens → Generate Token**

### Étape 3 — Configurer le webhook production

Même procédure, mais avec le dashboard production et la même URL webhook Orbi :
`https://orbi-field-api.onrender.com/api/v1/payments/webhooks/pawapay`

### Étape 4 — Passer en production dans Render

Dans **Render → orbi-field-api → Environment** :

| Variable | Valeur à changer |
|----------|-----------------|
| `PAWAPAY_API_TOKEN` | Nouveau token **production** (pas sandbox) |
| `PAWAPAY_WEBHOOK_SECRET` | Nouveau secret webhook **production** |
| `PAWAPAY_ENVIRONMENT` | Changer de `sandbox` en `production` |

**Ce changement d'environnement coûte 0 FCFA et prend 30 secondes.**
Le backend redémarre et utilise immédiatement l'API PawaPay réelle.

---

## Comprendre les frais PawaPay

PawaPay prend une commission sur chaque transaction.
Les frais varient selon les corridors mais typiquement :

- **Orange BF** : ~1.5 % à 2.5 % par transaction
- **Moov BF** : ~1.5 % à 2.5 % par transaction

Orbi prend déjà une commission de **18 %** (codée dans `payments.constants.ts` ligne `platformCommissionRate = 0.18`).
PawaPay prend sa part en plus. Le reste va au chauffeur.

---

## Vérification de l'intégration (checklist technique)

Après avoir configuré PawaPay sandbox :

**Backend opérationnel :**
- [ ] `GET https://orbi-field-api.onrender.com/api/v1/health/ready` → `{"status":"ready"}`
- [ ] Logs Render ne montrent pas d'erreur de démarrage PawaPay

**Test de paiement sandbox (depuis l'app) :**
- [ ] Rider choisit Mobile Money + numéro sandbox → commande une course
- [ ] PawaPay sandbox simule la confirmation
- [ ] Render Logs montre : `PawaPay webhook received` (ou équivalent)
- [ ] Neon → `payment_attempts` → ligne avec `status = 'SUCCEEDED'`
- [ ] Neon → `wallet_transactions` → CREDIT sur le wallet du chauffeur

**Signature webhook :**
- [ ] Les logs montrent que la signature HMAC est vérifiée (pas de warning "invalid signature")

---

## En cas de problème

### "PawaPay deposit was rejected: INVALID_MSISDN"
→ Le numéro de téléphone entré est invalide.
→ En sandbox, utiliser exactement `700000001` (sans indicatif, l'app ajoute +226).

### "PawaPay API error: HTTP 401"
→ Le token API est invalide ou expiré.
→ Régénérer un nouveau token dans le dashboard PawaPay et mettre à jour Render.

### "PawaPay webhook received with invalid signature" dans les logs
→ `PAWAPAY_WEBHOOK_SECRET` ne correspond pas au secret configuré dans le dashboard PawaPay.
→ Copier à nouveau le secret depuis PawaPay Dashboard → Webhooks.

### Le webhook n'arrive pas (timeout)
→ PawaPay ne peut pas atteindre l'URL webhook.
→ Vérifier que le backend Render est vivant (le Cloudflare Worker garde le service réveillé).
→ Vérifier que l'URL dans le dashboard PawaPay est exactement :
   `https://orbi-field-api.onrender.com/api/v1/payments/webhooks/pawapay`

### "FEATURE_FLAG_PAYMENTS is off"
→ Dans Render → Environment : `FEATURE_FLAG_PAYMENTS = on`

---

## Contacts PawaPay

- **Support sandbox** : [support@pawapay.io](mailto:support@pawapay.io) — mentionner "sandbox testing"
- **Documentation API** : [docs.pawapay.io](https://docs.pawapay.io)
- **Dashboard sandbox** : [dashboard.sandbox.pawapay.io](https://dashboard.sandbox.pawapay.io)
- **Dashboard production** : [dashboard.pawapay.io](https://dashboard.pawapay.io)
