# Architecture Orbi — Vue Système

*Dernière mise à jour : 25 mai 2026*
*Stabilité : fondation locale solide | Posture production : pilote contrôlé Ouagadougou*

---

## 1. Vue Macro — Topologie Système

```mermaid
graph TB
    subgraph Clients["Clients"]
        RA["📱 Rider App\n(Expo / Android · iOS)"]
        DA["📱 Driver App\n(Expo / Android · iOS)"]
        AW["🖥️ Admin Web\n(Next.js 15)"]
    end

    subgraph Backend["Backend — NestJS :3000"]
        direction TB
        AUTH["AuthModule\nscrypt · sessions"]
        RIDERS["RidersModule\nprofile · status"]
        DRIVERS["DriversModule\navailability · docs"]
        TRIPS["TripsModule\nlifecycle · presenter"]
        DISPATCH["DispatchModule\ncoordinator · offers"]
        PAYMENTS["PaymentsModule\nwallet · webhook"]
        ADMIN["AdminModule\nRBAC · audit · liveops"]
        RATINGS["RatingsModule\npost-trip"]
        PROMOS["PromoCodesModule\nvalidation · usage"]
        HEALTH["HealthModule\nliveness · readiness"]
        RATELIMIT["RateLimitService\nin-memory (→ PG prod)"]
    end

    subgraph Data["Persistance"]
        PG[("PostgreSQL 17\n(Prisma ORM)")]
        FS["Stockage fichiers\ndocuments chauffeur"]
    end

    subgraph Ext["Services Externes"]
        PAY["Passerelle Paiement\n(webhook HMAC)"]
        SMS["Passerelle SMS\n(OTP futur)"]
        PUSH["Push Notifications\n(FCM futur)"]
    end

    RA -->|HTTPS REST + token session| AUTH
    DA -->|HTTPS REST + token session| AUTH
    AW -->|HTTPS REST + cookie session admin| ADMIN

    AUTH --> RIDERS
    AUTH --> DRIVERS
    AUTH --> DISPATCH
    AUTH --> TRIPS
    AUTH --> PAYMENTS
    AUTH --> PROMOS
    AUTH --> RATINGS

    DISPATCH --> TRIPS
    DISPATCH --> DRIVERS
    TRIPS --> PAYMENTS
    TRIPS --> RATINGS

    ADMIN --> RIDERS
    ADMIN --> DRIVERS
    ADMIN --> TRIPS
    ADMIN --> PAYMENTS

    PAYMENTS -->|webhook entrant| PAY
    DRIVERS -->|upload| FS

    AUTH --> PG
    RIDERS --> PG
    DRIVERS --> PG
    TRIPS --> PG
    DISPATCH --> PG
    PAYMENTS --> PG
    ADMIN --> PG
    RATINGS --> PG
    PROMOS --> PG
    HEALTH --> PG

    RATELIMIT -.->|toutes les mutations| AUTH
```

---

## 2. Modèle de Données — Diagramme Entité-Relation

```mermaid
erDiagram
    User {
        string id PK
        string email UK
        string passwordHash
        string role "RIDER|DRIVER|ADMIN|OPS|SUPPORT"
        boolean isActive
        datetime createdAt
    }

    RiderProfile {
        string id PK
        string userId FK
        string fullName
        string phoneNumber
        datetime createdAt
    }

    DriverProfile {
        string id PK
        string userId FK
        string fullName
        string phoneNumber
        string status "PENDING|ACTIVE|SUSPENDED|REJECTED"
        string profilePhotoUrl
        datetime createdAt
    }

    Vehicle {
        string id PK
        string driverId FK
        string make
        string model
        string plateNumber
        string vehicleType "MOTO|CAR"
        boolean isActive
    }

    RideRequest {
        string id PK
        string riderId FK
        string promoCodeId
        string status "REQUESTED|MATCHED|DRIVER_ARRIVING|IN_PROGRESS|COMPLETED|CANCELLED"
        decimal estimatedFare
        string pickupAddress
        string destinationAddress
        datetime createdAt
    }

    Trip {
        string id PK
        string rideRequestId FK
        string riderId FK
        string driverId FK
        string status "MATCHED|DRIVER_ARRIVING|IN_PROGRESS|COMPLETED|CANCELLED"
        decimal fare
        datetime startedAt
        datetime completedAt
    }

    PromoCode {
        string id PK
        string code UK
        int discountBps
        boolean isActive
        int maxUses
        int usedCount
        datetime expiresAt
    }

    PaymentAttempt {
        string id PK
        string tripId FK
        string provider
        string providerReference UK
        string status "PENDING|SUCCESS|FAILED"
        decimal amount
        datetime createdAt
    }

    Wallet {
        string id PK
        string driverId FK
        decimal balance
        datetime updatedAt
    }

    AuditLog {
        string id PK
        string actorId FK
        string action
        string targetType
        string targetId
        json metadata
        datetime createdAt
    }

    Rating {
        string id PK
        string tripId FK
        string raterId FK
        string ratedId FK
        int score "1-5"
        string comment
        datetime createdAt
    }

    User ||--o| RiderProfile : "has"
    User ||--o| DriverProfile : "has"
    DriverProfile ||--o{ Vehicle : "owns"
    DriverProfile ||--|| Wallet : "has"
    User ||--o{ RideRequest : "creates (rider)"
    RideRequest ||--o| Trip : "generates"
    PromoCode ||--o{ RideRequest : "applied to"
    Trip ||--o{ PaymentAttempt : "triggers"
    Trip ||--o{ Rating : "receives"
    User ||--o{ AuditLog : "generates"
```

---

## 3. Flux Sécurité & RBAC

```mermaid
flowchart TD
    REQ["Requête HTTP entrante"] --> HTTPS{"HTTPS\nobligatoire prod"}
    HTTPS -->|non| R403A["403 Forbidden"]
    HTTPS -->|oui| CORS{"CORS\norigine autorisée?"}
    CORS -->|non| R403B["403 Forbidden"]
    CORS -->|oui| RATELIMIT{"RateLimitGuard\nlimite atteinte?"}
    RATELIMIT -->|oui| R429["429 Too Many Requests"]
    RATELIMIT -->|non| SESSGUARD{"SessionAuthGuard\ntoken valide?"}
    SESSGUARD -->|non| R401["401 Unauthorized"]
    SESSGUARD -->|oui| ROLESG{"RolesGuard\nrôle autorisé?"}
    ROLESG -->|non| R403C["403 Forbidden"]
    ROLESG -->|oui| DTO{"ValidationPipe\nDTO valide?"}
    DTO -->|non| R400["400 Bad Request"]
    DTO -->|oui| HANDLER["Handler métier"]
    HANDLER --> AUDIT["AuditLog (mutations admin)"]
    HANDLER --> RESP["200/201 Response"]

    subgraph Roles["Matrice RBAC"]
        direction LR
        R1["RIDER — ride-requests, trips, ratings, wallet"]
        R2["DRIVER — availability, offers, earnings, docs"]
        R3["OPS — liveops board, drivers, riders (lecture + suspension)"]
        R4["ADMIN — tout + config + exports"]
        R5["SUPPORT — lecture seule riders"]
    end

    subgraph AdminMutation["Sécurité mutations Admin Web"]
        direction TB
        AM1["isSafeAdminMutationRequest\nX-Admin-Mutation-Token header"]
        AM2["isSafeOpaqueAdminId\nformat UUID valide"]
        AM3["normalizePayload\nvalidation + truncation"]
        AM1 --> AM2 --> AM3
    end
```

---

## 4. Cycle de Vie d'une Course — Diagramme de Séquence

```mermaid
sequenceDiagram
    actor Rider
    actor Driver
    participant API as Backend API
    participant DB as PostgreSQL
    participant Pay as Passerelle Paiement

    Rider->>API: POST /ride-requests (pickup, dest, promoCode?)
    API->>DB: Valider promoCode + créer RideRequest (REQUESTED)
    API->>DB: Dispatch — chercher drivers disponibles
    API-->>Rider: { rideRequestId, estimatedFare }

    API->>Driver: Offre course (push/polling)
    Driver->>API: POST /trips/accept { rideRequestId }
    API->>DB: RideRequest → MATCHED, créer Trip (MATCHED)
    API-->>Driver: { tripId, riderInfo }
    API-->>Rider: Course acceptée

    Driver->>API: PATCH /trips/:id/arriving
    API->>DB: Trip → DRIVER_ARRIVING
    API-->>Rider: Chauffeur en route

    Driver->>API: PATCH /trips/:id/start
    API->>DB: Trip → IN_PROGRESS, startedAt = now()
    API-->>Rider: Course démarrée

    Driver->>API: PATCH /trips/:id/complete { finalFare }
    API->>DB: Trip → COMPLETED, RideRequest → COMPLETED
    API->>DB: Créer PaymentAttempt (PENDING)
    API-->>Driver: Course terminée
    API-->>Rider: Reçu disponible

    Pay-->>API: POST /payments/webhook (événement paiement)
    API->>DB: Idempotence (provider_reference unique)
    API->>DB: PaymentAttempt → SUCCESS
    API->>DB: Créditer Wallet chauffeur
    API->>DB: AuditLog PAYMENT_CONFIRMED

    Rider->>API: GET /trips/:id/detail
    API->>DB: Trip + RideRequest + PromoCode
    API-->>Rider: TripDetailResponse (fare, promoCode, rating)
```

---

## 5. Modules Backend — Dépendances NestJS

```mermaid
graph LR
    subgraph Core["Modules Globaux"]
        PRISMA["PrismaModule"]
        CONFIG["ConfigModule"]
        AUDIT_SVC["AuditLogService"]
        RATE["RateLimitService"]
    end

    subgraph Feature["Modules Fonctionnels"]
        AUTH_M["AuthModule"]
        RIDER_M["RidersModule"]
        DRIVER_M["DriversModule"]
        TRIP_M["TripsModule"]
        DISPATCH_M["DispatchModule"]
        PAY_M["PaymentsModule"]
        ADMIN_M["AdminModule"]
        PROMO_M["PromoCodesModule"]
        RATING_M["RatingsModule"]
        HEALTH_M["HealthModule"]
    end

    subgraph Guards["Guards Partagés"]
        SESS["SessionAuthGuard"]
        ROLES["RolesGuard"]
        PROFILE["ProfileAccessGuard"]
        OPAQUE["OpaqueIdPipe"]
    end

    CONFIG --> AUTH_M
    CONFIG --> PAY_M
    PRISMA --> AUTH_M
    PRISMA --> RIDER_M
    PRISMA --> DRIVER_M
    PRISMA --> TRIP_M
    PRISMA --> DISPATCH_M
    PRISMA --> PAY_M
    PRISMA --> ADMIN_M
    PRISMA --> PROMO_M
    PRISMA --> RATING_M
    PRISMA --> HEALTH_M

    AUTH_M --> SESS
    SESS --> ROLES
    ROLES --> PROFILE

    DISPATCH_M --> DRIVER_M
    DISPATCH_M --> TRIP_M
    TRIP_M --> PAY_M
    TRIP_M --> PROMO_M
    TRIP_M --> RATING_M
    ADMIN_M --> RIDER_M
    ADMIN_M --> DRIVER_M
    ADMIN_M --> TRIP_M
    ADMIN_M --> AUDIT_SVC

    OPAQUE -.->|validation ID| ADMIN_M
    OPAQUE -.->|validation ID| DRIVER_M
    RATE -.->|throttle mutations| AUTH_M
    RATE -.->|throttle mutations| PAY_M
```

---

## 6. Gates Production — LaunchReadiness

```mermaid
flowchart TD
    START(["Démarrage évaluation\nLaunchReadiness"]) --> G1

    G1{"runtime\nNode 22+ · Prisma OK"} -->|FAIL| BLK1["BLOCKED"]
    G1 -->|PASS| G2

    G2{"support-load\nAdmin Web joignable"} -->|FAIL| BLK2["BLOCKED"]
    G2 -->|PASS| G3

    G3{"urgent-support\nSuspension rider fonctionnelle"} -->|FAIL| BLK3["BLOCKED"]
    G3 -->|PASS| G4

    G4{"driver-onboarding\nValidation docs + export CSV"} -->|FAIL| BLK4["BLOCKED"]
    G4 -->|PASS| G5

    G5{"driver-documents\nStockage + accès sécurisé"} -->|FAIL| BLK5["BLOCKED"]
    G5 -->|PASS| G6

    G6{"payment-refunds\nRembours. + audit complet"} -->|FAIL| BLK6["BLOCKED"]
    G6 -->|PASS| G7

    G7{"payment-webhooks\nIdempotence + replay protection"} -->|FAIL| WARN7["⚠️ READY (warning)"]
    G7 -->|PASS| G8

    G8{"wallet-recovery\nRéconciliation solde"} -->|FAIL| BLK8["BLOCKED"]
    G8 -->|PASS| G9

    G9{"admin-realtime\nLiveOps board opérationnel"} -->|FAIL| WARN9["⚠️ READY (warning)"]
    G9 -->|PASS| G10

    G10{"safety-benchmark\nRating · incident report"} -->|FAIL| WARN10["⚠️ READY (warning)"]
    G10 -->|PASS| G11

    G11{"security-assurance\nRate limit PG · CORS · secrets prod"} -->|FAIL| BLK11["BLOCKED"]
    G11 -->|PASS| GO(["✅ GO — Lancement pilote\nOuagadougou"])

    style GO fill:#16a34a,color:#fff
    style BLK1 fill:#dc2626,color:#fff
    style BLK2 fill:#dc2626,color:#fff
    style BLK3 fill:#dc2626,color:#fff
    style BLK4 fill:#dc2626,color:#fff
    style BLK5 fill:#dc2626,color:#fff
    style BLK6 fill:#dc2626,color:#fff
    style BLK8 fill:#dc2626,color:#fff
    style BLK11 fill:#dc2626,color:#fff
    style WARN7 fill:#d97706,color:#fff
    style WARN9 fill:#d97706,color:#fff
    style WARN10 fill:#d97706,color:#fff
```

---

## 7. Plan Sprint Hardening — Tranches Production

| Priorité | Tranche | Surface | Test ciblé | Gate | Statut |
|----------|---------|---------|-----------|------|--------|
| 🔴 P0 | **Argent** | `PaymentsModule` · `Wallet` · webhook idempotence | `payments.service.spec` · `webhook.spec` | `payment-webhooks` · `payment-refunds` | À vérifier |
| 🔴 P0 | **Auth/Session** | `SessionAuthGuard` · rotation token · lock-out | `auth.service.spec` · `session.spec` | `security-assurance` | Partiel |
| 🟠 P1 | **Rate Limit PG** | `RateLimitService` adapter PostgreSQL prod | `rate-limit.spec` | `security-assurance` | ⚠️ in-memory |
| 🟠 P1 | **Launch Readiness** | `LaunchReadinessService` — 11 gates | `launch-readiness.spec` | tous | ✅ 824 tests |
| 🟡 P2 | **Mobile Smoke** | E2E API money-path · admin smoke | `local-api-e2e-smoke.ps1` | `payment-refunds` | Script OK |
| 🟡 P2 | **Runbook Prod** | `docs/deployment-runbook.md` — incidents | revue manuelle | ops readiness | À enrichir |
| 🟢 P3 | **Android Field** | Test sur device réel Tecno/Samsung | smoke physique | `safety-benchmark` | Non démarré |
| 🟢 P3 | **Secrets Prod** | `DOCUMENT_SIGNING_SECRET` · `PAYMENTS_WEBHOOK_SECRET` | validation env | `security-assurance` | ⚠️ dev defaults |

---

## Résumé Architecture

### Stack technique

| Couche | Technologie | Version | Rôle |
|--------|-------------|---------|------|
| **Backend** | NestJS | ^11.1 | API REST, Auth, Dispatch |
| **ORM** | Prisma | ^7.4 | DB type-safe, migrations |
| **Base de données** | PostgreSQL | 17+ | Stockage principal, index partiels |
| **Frontend Web** | Next.js | 15.x | Console admin |
| **Frontend Mobile** | Expo | ^52 | iOS + Android |
| **Runtime** | Node.js | 22+ | Backend + scripts |
| **Package Manager** | pnpm | ^10.30 | Coordination monorepo |
| **Tests** | Jest | ^30 | Unit, intégration, smoke |
| **Validation** | class-validator | latest | DTO (whitelist, forbid unknown) |

### Monorepo

```
orbi/
├── apps/
│   ├── backend/          # NestJS + Prisma (Auth, Dispatch, Payments, Admin API)
│   ├── admin-web/        # Next.js 15 — console opérations
│   ├── rider-app/        # Expo — réservation, course active, profil
│   ├── driver-app/       # Expo — disponibilité, offres, gains
│   └── mobile-shared/    # Utilitaires Expo partagés
├── packages/
│   ├── api/              # Contrat TypeScript partagé (types client)
│   ├── config/           # Validation env + constantes
│   ├── domain/           # Enums métier + tarifs
│   └── ui/               # Design tokens + helpers
└── docs/                 # Architecture, runbooks, stratégie
```

### Invariants critiques base de données

| Index | Table | Condition | Règle |
|-------|-------|-----------|-------|
| `ride_requests_single_active_per_rider_idx` | `RideRequest` | status IN (REQUESTED, MATCHED, DRIVER_ARRIVING) | 1 seul actif par rider |
| `trips_single_active_per_rider_idx` | `Trip` | status IN (MATCHED, DRIVER_ARRIVING, IN_PROGRESS) | 1 seul actif par rider |
| `payment_webhook_events_provider_ref_idx` | `PaymentWebhookEvent` | — | Idempotence webhook |

> **CRITIQUE** : Ces index NE DOIVENT JAMAIS être supprimés dans une migration.

### Authentification & Sessions

- Email normalisé (lowercase)
- Mot de passe : **scrypt** (sel + clé dérivée, comparaison timing-safe)
- Token session : 48 octets aléatoires, base64url
- Hash session : SHA-256 (seul le hash est stocké en DB)
- TTL : configurable via env (défaut 30 jours)

### Headers sécurité (toutes les réponses)

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-site
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains  (HTTPS détecté)
```

### CORS production

```typescript
app.enableCors({
  origin: frontendOrigins,   // whitelist depuis env — JAMAIS '*' en prod
  credentials: true,
});
```

### Variables d'environnement obligatoires (production)

```env
DATABASE_URL=postgresql://user:pass@host:5432/orbi
NODE_ENV=production
SESSION_TTL_DAYS=30
FRONTEND_ORIGINS=https://app.orbi.bf,https://admin.orbi.bf
ENABLE_SWAGGER=false
PAYMENTS_WEBHOOK_SECRET=<secret aléatoire 32+ octets>
DOCUMENT_SIGNING_SECRET=<secret aléatoire 32+ octets>
RATE_LIMIT_ADAPTER=postgres
```

### Health checks

- `GET /api/v1/health` — statut système complet
- `GET /api/v1/health/live` — liveness probe
- `GET /api/v1/health/ready` — readiness probe (503 jusqu'au prêt)

### Commandes clés

| Commande | Rôle |
|----------|------|
| `pnpm typecheck` | Validation TypeScript complète (tous les packages) |
| `pnpm test` | Tous les tests backend |
| `pnpm build` | Build tous les packages |
| `pnpm lint` | Lint tous les packages |
| `pnpm db:start` | Démarrer PostgreSQL local |
| `pnpm prisma:migrate` | Appliquer les migrations |

### Règles de sécurité — NE JAMAIS faire

- Exposer Swagger en production
- Stocker des mots de passe en clair
- Utiliser `*` comme origine CORS en production
- Logger des données personnelles (email, téléphone, token)
- Faire confiance aux IDs fournis par le client sans validation session
- Utiliser les secrets dev (`orbi_dev_*`) en production

### Références

- Runbook déploiement : `docs/deployment-runbook.md`
- Stratégie tarification : `docs/pricing-burkina-strategy.md`
- Plan d'exécution : `EXECUTION_PLAN.md`
- Statut développement : `DEVELOPMENT_STATUS.md`
