# Mobilis Architecture & Development Standards

*Last updated: May 5, 2026*
*Stability: PRODUCTION-GRADE | Coverage: 300 tests (100% pass rate)*

## Executive Summary

Mobilis is a complete mobility platform for Burkina Faso with:
- Unified moto + car experience for riders and drivers
- Secure authentication with session tokens & password hashing (scrypt + timing-safe comparison)
- Real-time dispatch with event-sourced trip lifecycle
- Premium voice intelligence for ride intent capture
- Wallet & payment system with webhook idempotency
- Operations dashboard for live management
- Multi-platform: Android, iOS, Web (Expo + Next.js)

## System Architecture

### Monorepo Structure

```
mobilis/
├── apps/
│   ├── backend/          # NestJS + Prisma (Auth, Dispatch, Payments, Admin API)
│   ├── admin-web/        # Next.js 15 ops console (live dispatch, pricing, health)
│   ├── rider-app/        # Expo app (booking, active ride, profile)
│   ├── driver-app/       # Expo app (availability, offers, trips, earnings)
│   └── mobile-shared/    # Shared UI logic (Expo)
├── packages/
│   ├── api/              # TypeScript API contract (shared client types)
│   ├── config/           # Environment validation & constants
│   ├── domain/           # Business enums & pricing presets
│   ├── ui/               # Shared design system
│   └── mobile-shared/    # Shared Expo utilities
└── docs/                 # Architecture, runbooks, strategy
```

### Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Backend** | NestJS | ^11.1 | REST API, Auth, Dispatch |
| **ORM** | Prisma | ^7.4 | Type-safe DB, Migrations |
| **Database** | PostgreSQL | 17+ | Primary store, partial indexes for ride lifecycle |
| **Frontend (Web)** | Next.js | 15.x | Admin console, analytics |
| **Frontend (Mobile)** | Expo | ^52 | iOS + Android unified codebase |
| **Runtime** | Node.js | 22+ | Backend + build scripts |
| **Package Manager** | pnpm | ^10.30 | Monorepo coordination |
| **Testing** | Jest | ^30 | Unit & integration tests (300 tests, 100% pass) |
| **Validation** | class-validator | Latest | DTO validation (whitelist mode, forbid unknown) |

## Security Architecture

### Authentication & Authorization

1. **Sign-Up / Sign-In**
   - Email normalized (lowercase)
   - Password hashed with **scrypt** (salt + derived key stored)
   - Session token: 48-byte random, base64url encoded
   - Session hash: SHA256 (one-way, DB stores only hash)
   - TTL: Configurable via env (default 30 days)

2. **Session Guards**
   - `SessionAuthGuard`: Validates session token against DB hash
   - `RolesGuard`: RBAC on endpoints (ADMIN, DRIVER, RIDER, OPS)
   - `ProfileAccessGuard`: Ensures users can only access their own data

3. **Database-Level Invariants**
   - `ride_requests_single_active_per_rider_idx`: Partial unique index (REQUESTED | MATCHED | DRIVER_ARRIVING)
   - `trips_single_active_per_rider_idx`: Partial unique index (MATCHED | DRIVER_ARRIVING | IN_PROGRESS)
   - **CRITICAL**: These indexes MUST NOT be dropped in any future migration

### Input Validation & Sanitization

- All DTOs use `class-validator` decorators
- ValidationPipe config: `whitelist: true, forbidNonWhitelisted: true, transform: true`
- Example (SignUpDto):
  ```typescript
  @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[\p{L}\p{M}]/) fullName
  @IsEmail() email
  @IsString() @MinLength(8) @MaxLength(128) password
  ```
- No raw SQL queries; all via Prisma (parameterized by default)

### Security Headers

- `X-Content-Type-Options: nosniff` (prevent MIME sniffing)
- `X-Frame-Options: DENY` (prevent clickjacking)
- `Referrer-Policy: no-referrer` (privacy)
- `Cross-Origin-Resource-Policy: same-site` (CORP)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` (restrict sensors)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (when HTTPS detected)

### CORS Configuration

```typescript
app.enableCors({
  origin: frontendOrigins,  // Whitelist from env
  credentials: true         // Allow cookies
});
```

### Rate Limiting

- `RateLimitService` with configurable limits per endpoint
- In-memory store (can be replaced with Redis for distributed systems)
- Tracked by key (IP, user_id, etc.)

## Data Model Invariants

### Core Entities

| Entity | Key Constraint | Notes |
|--------|---------------|-------|
| `User` | `email` (unique, normalized) | Rider + Driver profiles linked |
| `RideRequest` | Partial unique (1 active per rider) | Lifecycle: REQUESTED → MATCHED → DRIVER_ARRIVING → IN_PROGRESS → COMPLETED |
| `Trip` | Partial unique (1 active per rider) | Mirrors ride request lifecycle |
| `DriverPayout` | `reference` (idempotent) | Webhook safety |
| `PaymentWebhookEvent` | `provider + provider_reference` (unique) | At-least-once delivery |

### Lifecycle States

**Ride Requests:**
- `REQUESTED` → `MATCHED` → `DRIVER_ARRIVING` → `IN_PROGRESS` → `COMPLETED` | `CANCELLED`

**Trips:**
- `MATCHED` → `DRIVER_ARRIVING` → `IN_PROGRESS` → `COMPLETED` | `CANCELLED`

**Critical Rule:** Only ONE active ride_request and ONE active trip per rider at a time (enforced by partial unique indexes).

## API Contracts

### Core Response Format

```json
{
  "statusCode": 200,
  "message": "Optional message",
  "data": { /* entity or array */ },
  "meta": { "pagination": { "page": 1, "limit": 20, "total": 100 } }
}
```

### Example Endpoints

- `POST /api/v1/auth/sign-up` → Create account, return session token
- `POST /api/v1/auth/sign-in` → Authenticate, return session token
- `GET /api/v1/riders/me` → Get current rider profile (auth required)
- `POST /api/v1/ride-requests` → Create ride request (auth required, rider role)
- `GET /api/v1/admin/live` → Live dashboard data (auth required, OPS/ADMIN role)

### Versioning

- URI-based: `/api/v1/**`
- All new endpoints default to v1
- Breaking changes increment major version

## Testing Standards

### Coverage Requirements

- **Unit tests**: All services, utils, domain logic
- **Integration tests**: Controllers, guards, full request/response cycles
- **Database tests**: Migrations, constraints, data invariants

### Current Status

OK **300 tests** across 39 test suites
OK **100% pass rate**
OK **Prisma migration invariants** protected

### Writing Tests

```typescript
describe('AuthService', () => {
  it('signs up a new user with hashed password', async () => {
    const result = await authService.signUp({
      email: 'test@mobilis.app',
      password: 'SecurePassword123!',
      fullName: 'Test User',
      role: SignUpRole.RIDER
    });

    expect(result.sessionToken).toBeDefined();
    expect(result.user.id).toBeDefined();
  });
});
```

## Error Handling

### Standard Error Codes

| Code | Message | Example |
|------|---------|---------|
| 400 | Bad Request | Invalid email format |
| 401 | Unauthorized | Invalid session token |
| 403 | Forbidden | Insufficient role permissions |
| 404 | Not Found | User/ride not found |
| 409 | Conflict | Email already registered |
| 500 | Internal Server Error | Unexpected error |
| 503 | Service Unavailable | Instance still starting/draining |

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

## Deployment & Operations

### Environment Variables

Required in `apps/backend/.env`:

```env
DATABASE_URL=postgresql://user:pass@host:5432/mobilis
NODE_ENV=production
JWT_SECRET=<random 32+ bytes>
SESSION_TTL_DAYS=30
FRONTEND_ORIGINS=https://app.mobilis.bf,https://admin.mobilis.bf
ENABLE_SWAGGER_DOCS=false
```

### Health Checks

- `GET /api/v1/health` → Full system status
- `GET /api/v1/health/live` → Liveness probe
- `GET /api/v1/health/ready` → Readiness probe (returns 503 until ready)

### Graceful Shutdown

- 15-second timeout (configurable)
- Drains existing requests
- Closes DB connections safely
- Ideal for orchestrators (Kubernetes, Docker)

## Development Workflow

### Local Setup

```bash
pnpm setup:local          # Install deps, validate env
pnpm db:start              # Start PostgreSQL container
pnpm prisma:generate       # Generate Prisma client
pnpm prisma:migrate        # Run migrations
pnpm prisma:seed           # Seed demo data
pnpm dev:web-preview       # Backend + Admin + Rider (web)
```

### Key Commands

| Command | Purpose |
|---------|---------|
| `pnpm typecheck` | Full TypeScript validation (all packages) |
| `pnpm test` | Run all tests (backend) |
| `pnpm test -- <pattern>` | Run specific test |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |

### Commit Guidelines

After **every working feature**:

```bash
git add .
git commit -m "feat(dispatch): implement real-time driver matching

- Add DispatchEngine service with offer queue
- Implement race condition prevention
- Add 100% test coverage
- Update Prisma schema for driver availability
"
```

### Migration Safety

1. **Before making schema changes**: Run all tests
2. **After Prisma schema update**: `prisma migrate dev --name feature_name`
3. **NEVER manually drop indexes** that are in `CRITICAL CONSTRAINTS` list
4. **Review migration SQL** before pushing

### Code Review Checklist

- [ ] TypeScript strict mode passes
- [ ] All tests pass (300+ tests)
- [ ] No hardcoded secrets or env values
- [ ] DTOs validate all input
- [ ] Audit logs created for ops changes
- [ ] Database constraints documented in comments
- [ ] Error messages don't leak sensitive info
- [ ] Rate limiting applied to public endpoints

## Common Patterns

### Service Pattern (Dependency Injection)

```typescript
@Injectable()
export class RideRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchEngine: DispatchEngineService,
    private readonly auditLog: AuditLogService
  ) {}

  async createRideRequest(payload: CreateRideRequestDto, user: AuthenticatedUser) {
    // Validate, create, log
  }
}
```

### Guard Pattern (Authorization)

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    const requiredRoles = this.reflector.get<UserRole[]>('roles', context.getHandler());
    return requiredRoles.includes(user.role);
  }
}
```

### Presenter Pattern (Response Serialization)

```typescript
export function serializeAuthenticatedUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    // Omit passwordHash, sensitive data
  };
}
```

## Known Limitations & Roadmap

### Phase 1 (Complete OK)
- OK Core authentication & RBAC
- OK User profiles (Rider + Driver)
- OK Session management
- OK 300 unit/integration tests

### Phase 2 (In Progress)
- Real-time dispatch (WebSocket layer)
- Voice intent capture & NLU
- Payment webhooks (Stripe/Mobile Money)

### Phase 3 (Planned)
- Mobile error reporting
- Admin audit dashboard
- Driver performance scoring
- Multi-city operations

## Critical Security Notes

Warning **DO NOT:**
- Drop `ride_requests_single_active_per_rider_idx` or `trips_single_active_per_rider_idx`
- Store raw passwords anywhere
- Expose error stack traces to clients
- Trust client-provided user IDs (always validate against session)
- Enable Swagger docs in production

OK **DO:**
- Use class-validator for all DTOs
- Hash passwords with scrypt (never bcrypt for new projects)
- Log all admin/ops actions to audit trail
- Validate environment variables on startup
- Test with real PostgreSQL (not in-memory)

## Quick Links

- **GitHub**: https://github.com/mobilis-app/mobilis
- **API Docs**: `/docs` (when enabled)
- **Deployment**: See `docs/deployment-runbook.md`
- **Pricing Strategy**: See `docs/pricing-burkina-strategy.md`
- **Architecture Diagrams**: See `docs/architecture/`

## Contact & Support

- **Architecture Questions**: See AGENTS.md (team roles)
- **Bug Reports**: Use GitHub Issues with label `critical-security` if applicable
- **Product Decisions**: See EXECUTION_PLAN.md
