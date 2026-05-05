# Mobilis Runtime Architecture

Cette vue relie le modele de donnees, les cas d'utilisation et les invariants d'execution. Elle sert de carte de navigation pour continuer le developpement sans separer artificiellement produit, backend, temps reel et UX mobile.

## Documents Sources

- Diagramme de classes: `docs/architecture/class-diagram.md`
- Diagramme de cas d'utilisation: `docs/architecture/use-case-diagram.md`
- Invariants de donnees: `docs/architecture/data-invariants.md`
- Strategie pricing Burkina: `docs/pricing-burkina-strategy.md`
- Strategie paiement: `docs/payment-strategy.md`
- Runbook de deploiement: `docs/deployment-runbook.md`

## Vue Runtime

```mermaid
flowchart LR
  RiderApp[Rider App Expo]
  DriverApp[Driver App Expo]
  AdminWeb[Admin Web Next.js]
  ApiClient[@mobilis/api]
  Domain[@mobilis/domain]
  Backend[NestJS Backend]
  Prisma[Prisma Client]
  Postgres[(PostgreSQL)]
  Realtime[Realtime Service]
  Pricing[Pricing Service]
  Dispatch[Dispatch Coordinator]
  Payments[Payments Service]
  Providers[Payment Providers]

  RiderApp --> ApiClient
  DriverApp --> ApiClient
  AdminWeb --> ApiClient
  ApiClient --> Domain
  ApiClient --> Backend

  Backend --> Domain
  Backend --> Prisma
  Prisma --> Postgres
  Backend --> Realtime
  Backend --> Pricing
  Backend --> Dispatch
  Backend --> Payments
  Payments --> Providers

  Realtime -. streams .-> RiderApp
  Realtime -. streams .-> DriverApp
  Realtime -. streams .-> AdminWeb
```

## Flux Critiques

### Reservation Rider

1. L'app rider choisit pickup, destination, ville, service et paiement.
2. `@mobilis/api` transporte les DTO alignes sur `@mobilis/domain`.
3. `RideRequestsService` valide le payload, calcule route/pricing et verifie le flux actif.
4. PostgreSQL bloque les courses concurrentes via index uniques partiels.
5. `RealtimeService` diffuse la nouvelle demande aux surfaces rider, driver et admin.

### Offre Chauffeur

1. Le chauffeur passe en ligne apres verification de profil et vehicule actif.
2. `DispatchCoordinator` filtre les demandes compatibles.
3. `DispatchEngine` score distance, confiance, pression offre/demande et signaux d'apprentissage.
4. Une reservation temporaire protege l'offre contre les doubles acceptations.
5. Le chauffeur accepte, refuse ou laisse expirer.

### Onboarding Chauffeur

1. L'app chauffeur demande des liens d'upload signes par type de justificatif.
2. `DocumentLinksService` applique whitelist MIME/extension, taille maximale,
   nom de fichier normalise, TTL borne et signature HMAC.
3. La reponse d upload expose les contraintes au client chauffeur pour eviter
   les fichiers hors politique avant soumission.
4. Le rattachement des artefacts refuse toute cle qui ne vit pas sous le
   prefixe du profil chauffeur.
5. Le rattachement revalide type documentaire, extension objet et MIME avant
   creation ou remise en attente d un `DriverDocument`.
6. Si le client fournit `sizeBytes`, `sha256` ou `uploadSource`, ces signaux
   sont bornes, normalises et conserves dans `DriverDocument.metadata`.
7. La file admin calcule un score d integrite par document, une recommandation
   ops (`clear`, `review`, `resubmit`) et une guidance dossier
   (`approve`, `review`, `resubmit`) pour guider la revue sans bloquer
   automatiquement les documents historiques.
8. Chaque generation de liens ecrit un audit log sans exposer de secret.
9. Les operations consultent les justificatifs via liens de lecture courts avant
   decision explicite.
10. Chaque decision de revue conserve dans ses metadonnees une snapshot de la
    guidance dossier et du resume documentaire utilises au moment de l action,
    afin de rendre les approbations, revues et redemandes auditables a posteriori.
11. La file admin restitue les dernieres decisions avec cette snapshot quand
    elle existe, ce qui permet aux operations de relire le contexte de decision
    sans ouvrir les logs techniques.

### Cycle De Course

1. `TripsService` transforme une demande en course avec transaction.
2. Les transitions autorisees viennent de `@mobilis/domain`.
3. Le code pickup est visible seulement sur `MATCHED` et `DRIVER_ARRIVING`.
4. Chaque transition cree un `TripEvent` et pousse un evenement realtime.
5. Admin et support consomment la timeline pour operations, incidents et audit.

### Paiement

1. Le rider initialise un checkout apres creation de demande.
2. `PaymentsService` applique idempotence, montant, canal et fournisseur.
3. Les webhooks verifient le secret Mobilis puis la signature fournisseur si
   elle est configuree.
4. La reconciliation est idempotente par `providerReference` et ne casse pas le
   flux course.
5. Chaque webhook accepte est journalise dans `PaymentWebhookEvent` pour audit,
   replay et investigation fournisseur.
6. L'admin suit conversion, succes, echecs, webhooks ignores et taux de
   reconciliation dans calibration, live ops et journal webhook filtre.
7. Les details webhook exposes aux ops redigent les champs sensibles avant
   sortie API.
8. Une investigation paiement peut etre demarree depuis le journal; elle ecrit
   un audit log, publie un evenement admin et cree un ticket support si un
   utilisateur est connu.

## Garde-Fous Automatises

- `domain-prisma-contract.spec.ts`: compare enums Prisma et noyau domaine.
- `prisma-migration-invariants.spec.ts`: verifie les index uniques partiels critiques dans les migrations SQL.
- Smoke tests rider/driver: verifient les ecrans principaux et etats actifs.
- Smoke tests admin: verifient les regles de synchronisation ops et la decision
  `launch-readiness` avant pilote production.
- `document-links.service.spec.ts`: verrouille les contraintes MIME, extension,
  taille, TTL et normalisation de cle de stockage documentaire.
- `pnpm typecheck`: build les packages partages, build admin, typecheck mobile,
  build backend.

## Prochaines Extensions

- Adapters fournisseur pour verification de statut, remboursements et replay de webhook stocke.
- Observabilite runtime: latence API, latence realtime, taux d'expiration
  reservation, taux de conversion paiement et tendances des rapports mobiles
  `MOB-*`.
- Tests UI par parcours complet rider/driver/admin sur web preview.
- Notifications push/SMS/email branchees sur `Notification`.
- Gestion avancee support: escalades incident, SLA, pieces jointes, moderation.
