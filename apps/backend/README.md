# Mobilis Backend

Backend NestJS pour la plateforme Mobilis.

## Base actuelle

- versionnement API sur `/api/v1/*`
- documentation Swagger sur `/docs`
- validation de configuration
- integration Prisma
- modules pour auth, users, riders, drivers, vehicles, ride requests, trips, pricing, admin, health et voice
- fondation paiements avec abstraction provider pour agregateur mobile money
- modele Prisma pense pour les motos et voitures

## Installation locale

```bash
pnpm install
copy .env.example .env
copy prisma\.env.example prisma\.env
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm start:dev
```

## Endpoints importants

- `GET /api/v1/health`
- `POST /api/v1/auth/sign-up`
- `POST /api/v1/auth/sign-in`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/sessions`
- `POST /api/v1/auth/sign-out`
- `GET /api/v1/admin/overview`
- `GET /api/v1/admin/dispatch-settings`
- `PATCH /api/v1/admin/dispatch-settings`
- `GET /api/v1/admin/payment-webhook-events`
- `GET /api/v1/admin/payment-webhook-events/:eventId`
- `POST /api/v1/admin/payment-webhook-events/:eventId/investigation`
- `POST /api/v1/admin/payment-webhook-events/:eventId/replay`
- `GET /api/v1/riders/overview`
- `GET /api/v1/drivers/overview`
- `GET /api/v1/drivers/offers`
- `GET /api/v1/vehicles`
- `POST /api/v1/ride-requests`
- `GET /api/v1/ride-requests/active`
- `GET /api/v1/trips/dashboard`
- `GET /api/v1/pricing/rules`
- `GET /api/v1/pricing/estimate`
- `POST /api/v1/voice/location-intent`
- `POST /api/v1/payments/checkout-intents`
- `POST /api/v1/payments/webhooks`

## Auth Phase 2

- `sign-up` cree un compte `RIDER` ou `DRIVER`, son wallet, son profil associe et une session active
- `sign-in` retourne un token de session opaque a envoyer en `Authorization: Bearer <token>`
- les endpoints `admin`, `users`, `riders` et `drivers` sont maintenant proteges par session + roles
- `sign-out` revoque la session courante, ou une autre session du meme utilisateur via `sessionId`

## Comptes seed

- `admin@mobilis.app` / `Mobilis123!`
- `rider@mobilis.app` / `Mobilis123!`
- `driver@mobilis.app` / `Mobilis123!`

## Paiements

Le backend expose maintenant une fondation paiements orientee agregateur:

- provider configurable par `PAYMENTS_PROVIDER` (`flutterwave` par defaut, `cinetpay` supporte)
- endpoint `checkout-intents` pour preparer un paiement ride-side sans coupler le produit a un seul fournisseur
- endpoint `webhooks` pour verification signature, reconciliation idempotente et journalisation
- endpoint admin `payment-webhook-events` pour auditer les notifications fournisseur recentes
- endpoint detail webhook avec payload redige pour investigation sans exposer les secrets, signatures ou numeros
- action admin `payment-webhook-events/:eventId/replay` pour rejouer un webhook deja journalise sans accepter de nouveau payload manuel
- action admin `payment-attempts/:paymentAttemptId/verify-provider` pour verifier une tentative directement chez Flutterwave/CinetPay, puis reconcilier via le meme chemin idempotent que les webhooks
- action admin `investigation` pour journaliser une enquete et creer un ticket support quand l evenement est rattache a un utilisateur
- ledger chauffeur idempotent apres paiement `SUCCEEDED`: credit du wallet chauffeur avec payout net et commission Mobilis en metadata
- endpoints admin `driver-wallets/:walletId/payouts/prepare` et `driver-payouts/:payoutId/paid` pour preparer puis marquer paye un payout chauffeur avec audit log, signal realtime et transaction ledger `PAYOUT`
- exports admin `driver-payouts/settlement.csv` et `driver-payouts/settlement.pdf` pour les settlements terrain signes et audites

Variables utiles:

- `PAYMENTS_PROVIDER`
- `PAYMENTS_CURRENCY`
- `PAYMENTS_WEBHOOK_SECRET`
- `PAYMENTS_DEFAULT_REDIRECT_URL`
- `PAYMENTS_DEFAULT_WEBHOOK_URL`
- `FLUTTERWAVE_PUBLIC_KEY`
- `FLUTTERWAVE_SECRET_KEY`
- `FLUTTERWAVE_WEBHOOK_SECRET_HASH`
- `CINETPAY_SITE_ID`
- `CINETPAY_API_KEY`
- `CINETPAY_SECRET_KEY`

## Realtime production

- `REALTIME_ADAPTER=in-memory` pour le dev local simple
- `REALTIME_ADAPTER=postgres` pour la preproduction/production multi-instance
- `REALTIME_ADAPTER=redis` reste reserve a un futur transport Redis
- `REALTIME_REDIS_URL` preparatoire pour un futur backplane Redis
- `REALTIME_STRICT=true` pour faire echouer la readiness si l adapter configure n est pas effectivement disponible
- `DRIVER_RESERVATION_EXPIRY_SWEEP_INTERVAL_MS=5000` pour definir la frequence de nettoyage serveur des reservations chauffeur expirees
- `DISPATCH_SIGNAL_LOOKBACK_HOURS=72` pour la profondeur d historique exploitee par la memoire dispatch
- `DISPATCH_SIGNAL_HALF_LIFE_HOURS=18` pour la vitesse de decay des signaux comportementaux
- `DISPATCH_DECLINE_COOLDOWN_MINUTES=20` pour eviter de reproposer trop vite une offre explicitement refusee
- `DISPATCH_SIGNAL_HISTORY_LIMIT=48` pour plafonner le volume d evenements dispatch analyses par chauffeur

Important:

- tant que le transport Redis partage n est pas branche, `REALTIME_ADAPTER=redis` place le backend en mode degrade visible dans `health`
- utiliser `REALTIME_STRICT=true` en preproduction/production pour bloquer un deploy qui tomberait en fallback in-memory
- le sweep d expiration chauffeur est produit par timer mais execute via la job queue durable `DRIVER_RESERVATION_EXPIRY`; le dedupe key `driver-reservation-expiry:sweep` et le claim `FOR UPDATE SKIP LOCKED` evitent les doubles sweeps multi-instance

## Reglages dispatch persistants

- `GET /api/v1/admin/dispatch-settings` expose le snapshot actif de la memoire dispatch
- `PATCH /api/v1/admin/dispatch-settings` permet aux roles `ADMIN` et `OPS` de surcharger durablement les reglages
- les valeurs personnalisees sont stockees dans `system_settings` et survivent aux redemarrages backend
- un reset admin repasse sur la configuration par defaut tout en gardant la trace dans `audit_logs`

## Rate limit production

- `RATE_LIMIT_ADAPTER=in-memory` pour le dev local simple
- `RATE_LIMIT_ADAPTER=postgres` pour un comptage partage entre instances
- `RATE_LIMIT_ADAPTER=redis` reste reserve a un futur store Redis
- `RATE_LIMIT_REDIS_URL` preparatoire pour un futur store Redis
- `RATE_LIMIT_STRICT=true` pour faire echouer la readiness si le rate limiting partage attendu n est pas effectivement disponible

Important:

- `RATE_LIMIT_ADAPTER=postgres` utilise la base PostgreSQL configuree comme
  backplane partage multi-instance
- la table `mobilis_rate_limit_counters` est creee par migration Prisma; le
  runtime applicatif ne depend pas d un droit DDL en production
- `RATE_LIMIT_ADAPTER=redis` reste signale degrade tant que l adapter Redis
  n est pas branche
- activer `RATE_LIMIT_STRICT=true` en preproduction/production pour bloquer un
  deploy multi-instance qui tomberait en fallback local

## File durable paiements

- `PAYMENT_WEBHOOK` garde un outbox durable pour les webhooks paiement
- `PAYMENT_REFUND_VERIFICATION` reprend automatiquement les refunds provider
  en `REFUND_PENDING` jusqu au verdict final du provider ou dead-letter visible
  aux operations
- les remboursements restent idempotents: le worker appelle la verification
  provider et la reversal wallet utilise toujours la reference unique
  `payment:<paymentAttemptId>:driver-payout-refund`

## Realtime partage

`REALTIME_ADAPTER=in-memory` garde le flux SSE local, utile en developpement
mono-instance. Pour preproduction/production multi-instance, utiliser
`REALTIME_ADAPTER=postgres`: le backend publie les evenements via
PostgreSQL `LISTEN/NOTIFY` et `health.infrastructure.realtime.sharedBackplane`
doit passer a `true`.

Important:

- `REALTIME_ADAPTER=postgres` reutilise `DATABASE_URL` et ne demande pas de
  dependance externe additionnelle
- les flux SSE restent lies a la session authentifiee: le backend ferme le
  stream quand `session.expiresAt` est atteint, meme si le client garde la
  connexion ouverte
- `REALTIME_ADAPTER=redis` reste signale degrade tant que l adapter Redis
  n est pas branche
- activer `REALTIME_STRICT=true` en preproduction/production pour faire remonter
  une degradation si le backplane partage tombe en fallback local

## Observabilite mobile

- Les apps rider/driver classent les erreurs client avec la taxonomie `MOB-*`.
- Le backend revalide le role applicatif avant ingestion, borne les champs, puis
  redige les secrets cote serveur avant d ecrire l audit log.
- Les rapports critiques creent un ticket support deduplique et publient un
  signal realtime admin.

## Garde-fous de demarrage production

Avec `NODE_ENV=production`, le backend refuse de demarrer si une configuration
de developpement est encore exposee:

- `ENABLE_SWAGGER` doit etre `false`
- `FRONTEND_ALLOWED_ORIGINS` doit lister des origines explicites, sans `*` ni localhost
- `DATABASE_URL` ne doit pas pointer vers localhost
- `RATE_LIMIT_ADAPTER=postgres` et `RATE_LIMIT_STRICT=true` sont obligatoires
- `REALTIME_ADAPTER=postgres` et `REALTIME_STRICT=true` sont obligatoires
- `PAYMENTS_DEFAULT_REDIRECT_URL` et `PAYMENTS_DEFAULT_WEBHOOK_URL` ne doivent pas pointer localhost
- `DOCUMENT_UPLOAD_BASE_URL` et `DOCUMENT_VIEW_BASE_URL` doivent etre HTTPS et non locales
- les secrets paiement/document ne doivent pas utiliser les valeurs de dev
