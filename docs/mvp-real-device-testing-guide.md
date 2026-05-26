# Guide tres simple: tester le MVP Orbi en reel

Ce guide s'adresse a une personne qui ne connait pas l'informatique. Il explique
comment passer du projet Orbi sur ordinateur a un test reel avec:

- une console admin ouverte sur ordinateur;
- une app Android passager installee sur telephone;
- une app Android chauffeur installee sur telephone;
- un backend de test accessible par Internet;
- des paiements CinetPay en mode test, puis eventuellement en petits montants
  reels controles.

Le but n'est pas de lancer directement en production. Le but est de verifier,
avec de vraies personnes et de vrais telephones, que le MVP fonctionne sans
perdre d'argent, de securite ou de confiance.

## 1. Ce qu'il faut comprendre avant de commencer

Orbi contient plusieurs parties:

| Partie | Role | Test sur quoi |
| --- | --- | --- |
| Backend | Le serveur: comptes, trajets, paiements, admin, securite | Ordinateur ou serveur cloud |
| Admin Web | La console operations | Navigateur ordinateur |
| Rider App | App passager | Telephone Android |
| Driver App | App chauffeur | Telephone Android |
| PostgreSQL | Base de donnees | Serveur |
| CinetPay | Paiement mobile money/carte via integrateur | Compte CinetPay |

Il ne faut pas convertir toute l'app en desktop. Le bon setup est:

1. Admin sur ordinateur.
2. Rider APK sur telephone Android.
3. Driver APK sur telephone Android.
4. Backend accessible en HTTPS.
5. Paiements en test ou limites.

## 2. Ce qu'il faut preparer

### Materiel

- 1 ordinateur Windows.
- 1 telephone Android pour le passager.
- 1 telephone Android pour le chauffeur.
- Une connexion Internet stable.
- Idealement 1 compte email pour Expo et 1 compte email pour CinetPay.

### Comptes a creer

1. Creer un compte Expo:
   - Ouvrir https://expo.dev
   - Cliquer sur `Sign Up`
   - Creer un compte avec email et mot de passe
   - Confirmer l'email si Expo le demande

2. Creer ou demander un compte CinetPay:
   - Ouvrir https://cinetpay.com
   - Creer un compte marchand ou demander l'acces test
   - Demander les informations suivantes:
     - `APIKEY`
     - `SITE_ID`
     - mode test/sandbox si disponible
     - URL de notification webhook a configurer

Sans agrement direct Orange/Moov, c'est justement le role d'un integrateur comme
CinetPay: il sert d'intermediaire entre ton application et plusieurs moyens de
paiement. Tu dois quand meme avoir un compte marchand CinetPay et respecter
leurs conditions.

## 3. Regle importante sur les paiements

Ne commence jamais avec de gros montants reels.

Ordre recommande:

1. Mode local sans argent reel.
2. Mode CinetPay test/sandbox.
3. Mode reel avec petits montants, par exemple 100 a 500 XOF.
4. Pilote ferme avec reconciliation manuelle quotidienne.
5. Production seulement apres validation.

Pendant le pilote, garde un tableau manuel:

| Date | Rider | Chauffeur | Montant | Moyen paiement | Statut backend | Statut CinetPay | Payout chauffeur |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05-26 | Awa | Issa | 500 XOF | CinetPay test | SUCCEEDED | ACCEPTED | Non paye |

## 4. Installer les outils sur l'ordinateur

Ces outils sont peut-etre deja installes. Si oui, passer a l'etape suivante.

### Verifier Node.js

1. Ouvrir le menu Windows.
2. Taper `PowerShell`.
3. Ouvrir `Windows PowerShell`.
4. Taper:

```powershell
node -v
```

Si une version s'affiche, il faut verifier le debut:

- `v22...`: bon pour Orbi et Expo.
- `v20...`: acceptable.
- `v24...`: ne pas continuer pour les APK Expo. Expo SDK 52 peut echouer avec
  `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.

Pour ce projet, la version recommandee est Node.js 22 LTS.

### Installer Node.js 22 LTS si PowerShell affiche v24

Faire ceci seulement si `node -v` affiche `v24...` ou une version plus recente.

1. Ouvrir le site officiel:
   - https://nodejs.org
2. Cliquer sur la version `LTS`.
3. Telecharger l'installateur Windows.
4. Ouvrir le fichier telecharge.
5. Cliquer sur `Next`.
6. Accepter la licence.
7. Garder les options par defaut.
8. Cliquer sur `Install`.
9. Fermer PowerShell completement.
10. Rouvrir PowerShell.
11. Taper:

```powershell
node -v
```

Le resultat doit commencer par `v22`.

Si PowerShell affiche encore `v24`, redemarrer l'ordinateur puis verifier encore:

```powershell
node -v
```

### Verifier pnpm

Dans PowerShell:

```powershell
pnpm -v
```

Si une version s'affiche, c'est bon.

### Installer EAS CLI

EAS est l'outil Expo qui fabrique les APK Android dans le cloud Expo.

Dans PowerShell:

```powershell
npm install --global eas-cli
```

Puis verifier:

```powershell
eas --version
```

### Se connecter a Expo

Dans PowerShell:

```powershell
eas login
```

Expo demande email et mot de passe. Entrer le compte cree sur expo.dev.

Verifier:

```powershell
eas whoami
```

Si ton nom Expo s'affiche, c'est bon.

## 5. Tester d'abord sur ordinateur

Avant de faire un APK, il faut verifier que le projet est vert.

Dans PowerShell:

```powershell
cd C:\Users\LENOVO\Desktop\orbi
pnpm test:production:gate
```

Resultat attendu:

```text
[ok] Production readiness gate completed.
```

Si ce test echoue, ne pas construire l'APK. Corriger d'abord.

## 6. Verifier les fichiers EAS pour produire des APK

Le repo contient maintenant un fichier `eas.json` dans chaque app mobile:

- `apps/rider-app/eas.json`
- `apps/driver-app/eas.json`

Ces fichiers disent a Expo comment fabriquer:

- un APK interne pour le test MVP;
- un AAB pour Google Play plus tard.

### Rider app

```text
C:\Users\LENOVO\Desktop\orbi\apps\rider-app\eas.json
```

### Driver app

```text
C:\Users\LENOVO\Desktop\orbi\apps\driver-app\eas.json
```

Chaque fichier contient notamment:

```json
{
  "cli": {
    "version": ">= 10.0.0"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "aab"
      }
    }
  }
}
```

Explication simple:

- `preview` fabrique un `.apk` facile a installer sur telephone.
- `mvp` fabrique aussi un `.apk` pour le pilote ferme.
- `production` fabrique un `.aab` pour Google Play plus tard.
- Pour le MVP terrain, utiliser `mvp` ou `preview`.

## 7. Configurer l'adresse du backend dans les apps

Les telephones Android ne doivent pas appeler `localhost`, car `localhost`
signifie le telephone lui-meme, pas ton ordinateur.

Pour un vrai test, le backend doit etre accessible avec une URL publique HTTPS,
par exemple:

```text
https://api-staging.orbi.app
```

Dans:

```text
apps/rider-app/.env
apps/driver-app/.env
```

mettre:

```env
EXPO_PUBLIC_API_BASE_URL=https://api-staging.orbi.app
EXPO_PUBLIC_API_VERSION=v1
EXPO_PUBLIC_PAYMENT_REDIRECT_URL=orbi-passager://payment-return
```

Pour le chauffeur, garder aussi:

```env
EXPO_PUBLIC_API_BASE_URL=https://api-staging.orbi.app
EXPO_PUBLIC_API_VERSION=v1
```

Important:

- Pour APK terrain, eviter `http://localhost:3000`.
- Utiliser HTTPS.
- Garder les secrets uniquement cote backend, jamais dans l'app mobile.

## 8. Construire l'APK passager

Dans PowerShell:

```powershell
cd C:\Users\LENOVO\Desktop\orbi
pnpm build:android:rider:mvp
```

Ce qui va se passer:

1. Expo peut demander de configurer le projet.
2. Expo peut demander les identifiants Android.
3. Choisir l'option automatique quand Expo propose de gerer les credentials.
4. Attendre la fin du build.
5. Expo affiche un lien de telechargement.

Quand le build est termine:

- Copier le lien donne par Expo.
- Ouvrir ce lien sur le telephone Android passager.
- Telecharger le fichier `.apk`.

## 9. Construire l'APK chauffeur

Dans PowerShell:

```powershell
cd C:\Users\LENOVO\Desktop\orbi
pnpm build:android:driver:mvp
```

Puis faire pareil:

- attendre le build;
- ouvrir le lien sur le telephone chauffeur;
- telecharger le `.apk`.

## 10. Installer l'APK sur Android

Sur le telephone Android:

1. Ouvrir le lien APK.
2. Telecharger le fichier.
3. Android peut afficher: `Pour votre securite, votre telephone n'est pas autorise a installer des apps inconnues`.
4. Cliquer sur `Parametres`.
5. Activer `Autoriser depuis cette source`.
6. Revenir en arriere.
7. Cliquer sur `Installer`.
8. Attendre la fin.
9. Cliquer sur `Ouvrir`.

Faire cela pour:

- Orbi Passager sur le telephone passager;
- Orbi Chauffeur sur le telephone chauffeur.

## 11. Tester que l'app parle bien au backend

Sur le telephone passager:

1. Ouvrir `Orbi Passager`.
2. Se connecter avec un compte test rider.
3. Si l'app dit probleme reseau, verifier:
   - Internet du telephone;
   - URL `EXPO_PUBLIC_API_BASE_URL`;
   - backend en ligne;
   - certificat HTTPS valide.

Sur le telephone chauffeur:

1. Ouvrir `Orbi Chauffeur`.
2. Se connecter avec un compte test driver.
3. Passer en ligne.
4. Verifier que le statut change.

Sur l'ordinateur:

1. Ouvrir Admin Web.
2. Se connecter avec compte admin test.
3. Verifier que les riders/drivers apparaissent.

## 12. Test MVP complet sans argent reel

Faire ce test avant CinetPay reel.

### Scenario

1. Passager ouvre l'app.
2. Passager choisit depart.
3. Passager choisit destination.
4. Passager choisit service.
5. Passager choisit `cash` si disponible.
6. Passager confirme.
7. Chauffeur recoit l'offre.
8. Chauffeur accepte.
9. Passager voit le chauffeur.
10. Chauffeur signale l'arrivee.
11. Passager donne le code pickup.
12. Chauffeur saisit le code.
13. Course demarre.
14. Chauffeur termine la course.
15. Admin verifie:
    - trip cree;
    - timeline;
    - audit logs;
    - support vide;
    - wallet chauffeur si paiement simule.

Si ce scenario ne marche pas, ne pas tester l'argent.

## 13. Tester CinetPay sans agrement Orange/Moov direct

Tu n'as pas besoin d'un agrement direct avec Orange ou Moov pour commencer un
test CinetPay. Tu as besoin d'un compte CinetPay et de leurs identifiants.

CinetPay Checkout utilise notamment:

- `apikey`;
- `site_id`;
- `transaction_id`;
- `amount`;
- `currency`;
- `description`;
- `notify_url`;
- `return_url`;
- donnees client.

La documentation CinetPay indique aussi une URL de verification de paiement:

```text
https://api-checkout.cinetpay.com/v2/payment/check
```

### Etapes CinetPay

1. Creer le compte CinetPay.
2. Recuperer `APIKEY` et `SITE_ID`.
3. Demander explicitement le mode test si le dashboard ne l'affiche pas.
4. Creer une URL webhook publique dans le backend staging:

```text
https://api-staging.orbi.app/api/v1/payments/webhooks/cinetpay
```

5. Dans CinetPay, configurer `notify_url` avec cette URL.
6. Dans backend staging, configurer les variables CinetPay.

Exemple de variables cote backend:

```env
PAYMENTS_PROVIDER=cinetpay
CINETPAY_API_KEY=xxxx
CINETPAY_SITE_ID=xxxx
PAYMENTS_DEFAULT_WEBHOOK_URL=https://api-staging.orbi.app/api/v1/payments/webhooks/cinetpay
PAYMENTS_DEFAULT_REDIRECT_URL=orbi-passager://payment-return
PAYMENTS_WEBHOOK_SECRET=une-valeur-longue-et-secrete
```

Ne jamais mettre `CINETPAY_API_KEY` dans l'app Android.

## 14. Tester un paiement CinetPay

### Premier test: tres petit montant ou mode test

1. Ouvrir app passager.
2. Choisir un trajet de test.
3. Choisir paiement mobile money/CinetPay.
4. Confirmer.
5. L'app doit creer une tentative de paiement.
6. CinetPay doit afficher une page ou un flux paiement.
7. Finaliser selon le mode test.
8. Attendre le webhook.
9. Ouvrir Admin Web.
10. Aller dans journal paiement/webhooks.
11. Verifier:
    - webhook recu;
    - montant correct;
    - reference correcte;
    - statut `SUCCEEDED` ou equivalent;
    - wallet chauffeur credite seulement apres paiement confirme.

### Si le webhook ne vient pas

Verifier:

1. L'URL webhook est publique.
2. L'URL est HTTPS.
3. CinetPay a la bonne `notify_url`.
4. Le backend staging tourne.
5. Les logs backend ne montrent pas d'erreur.
6. La transaction peut etre verifiee via l'endpoint CinetPay de verification.

## 15. Remboursements et payouts pendant le MVP

Au debut:

- refund: tester en sandbox ou manuellement;
- payout chauffeur: manuel;
- ne pas automatiser le transfert chauffeur;
- garder une reconciliation quotidienne.

Procedure simple:

1. Tous les soirs, ouvrir Admin Web.
2. Exporter les paiements.
3. Exporter les wallets/payouts.
4. Comparer avec CinetPay.
5. Comparer avec les notes terrain.
6. Marquer payout prepare/paye seulement si tout correspond.

## 16. Test terrain avec 5 personnes

### Participants

- 2 passagers internes.
- 2 chauffeurs internes.
- 1 personne ops/admin sur ordinateur.

### Jour 1

1. Installer les APK.
2. Creer les comptes.
3. Faire 3 trajets sans argent reel.
4. Tester annulation.
5. Tester SOS en protocole interne, sans appeler inutilement les urgences.
6. Tester partage trajet.
7. Tester support.

### Jour 2

1. Faire 5 trajets.
2. Tester CinetPay test/sandbox.
3. Comparer backend, admin et CinetPay.
4. Corriger bugs.

### Jour 3

1. Faire 5 a 10 trajets.
2. Petits montants reels seulement si CinetPay est pret.
3. Reconciliation manuelle.
4. Aucun payout automatique.

## 17. Checklist avant de donner l'APK a quelqu'un

Ne donne pas l'APK si une case est fausse.

- [ ] `pnpm test:production:gate` est vert.
- [ ] Backend staging HTTPS fonctionne.
- [ ] Admin staging fonctionne.
- [ ] Rider APK installe et ouvre.
- [ ] Driver APK installe et ouvre.
- [ ] Connexion rider OK.
- [ ] Connexion driver OK.
- [ ] Driver peut passer en ligne.
- [ ] Rider peut creer une demande.
- [ ] Driver peut accepter.
- [ ] Code pickup marche.
- [ ] Annulation marche.
- [ ] SOS cree un ticket et ouvre le dialer.
- [ ] Partage trajet marche.
- [ ] Paiement test marche ou cash manuel choisi.
- [ ] Admin voit les evenements.
- [ ] Les logs sont accessibles.

## 18. Que dire aux testeurs

Message simple:

```text
Bonjour, voici une version test de Orbi.
Elle sert uniquement au pilote ferme.
N'utilisez pas de gros montants.
Signalez chaque bug avec une capture d'ecran.
Si une course ou un paiement semble incorrect, prevenez l'equipe Orbi avant de continuer.
```

Demander aux testeurs de noter:

- ce qu'ils n'ont pas compris;
- bouton introuvable;
- ecran lent;
- paiement confus;
- prix juge trop haut;
- probleme position GPS;
- probleme appel/SOS;
- probleme chauffeur/passager.

## 19. Quand passer a un pilote plus grand

Passer de 5 personnes a 20 personnes seulement si:

- 20 trajets supervises sans perte d'argent;
- 0 paiement non explique;
- 0 wallet chauffeur incorrect;
- 0 bug de session critique;
- 0 crash Android bloquant;
- support sait traiter les incidents;
- CinetPay/webhooks sont compris;
- rollback procedure connue.

## Sources officielles utiles

- Expo EAS Build: https://docs.expo.dev/build/
- Expo APK Android: https://docs.expo.dev/build-reference/apk/
- Expo `eas.json`: https://docs.expo.dev/build/eas-json/
- CinetPay initialisation paiement: https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
- CinetPay verification paiement: https://docs.cinetpay.com/api/1.0-fr/checkout/verification
