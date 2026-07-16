# Orbi Security Policy & Vulnerability Management

*Last updated: May 17, 2026*

## Current Security Status

Application security foundation: strong for local MVP and controlled pilot.
Authentication uses scrypt and timing-safe session-token comparison. Input
validation uses class-validator with whitelist mode. Authorization is RBAC with
session-based guards. Security headers are configured in the backend.

Dependency vulnerabilities require ongoing review. The current local dependency
gate is clean as of May 17, 2026:

```bash
pnpm audit --audit-level moderate --ignore-registry-errors
```

Result on May 17, 2026: no known vulnerabilities found. The local gates tolerate
registry-side audit endpoint failures so an unavailable SCA provider does not
block unrelated release checks; any reported vulnerability at or above
`moderate` remains blocking.

## Vulnerability Assessment

### Critical Issues

No active critical or high dependency advisories are currently reported by the
local `pnpm audit --audit-level moderate --ignore-registry-errors` gate.

### Strategy

**Rule 1: Application code is secured, vulnerabilities are transitive dev dependencies**
- Our backend doesn't use `handlebars` or `tar` directly
- They're pulled in via `ts-jest` and `@expo/cli`
- Risk is minimal for production (not executed in backend runtime)

**Rule 2: Upgrade selectively to maintain stability**
- Don't use `pnpm audit --fix` auto-overrides (creates version locks)
- Use `.npmrc` overrides for critical packages only
- Test thoroughly after updates

### Remediation Plan

1. OK Fix Prisma migration invariants (COMPLETED)
2. OK Document architecture & security (COMPLETED)
3. OK Add pnpm security overrides and patched dependencies for vulnerable
   transitive packages (COMPLETED)
4. OK Re-run dependency audit after overrides (COMPLETED)
5. OK Run SCA in CI with `pnpm audit --audit-level moderate` (COMPLETED)
6. Continue scheduled SCA before production release gates

## Security Best Practices for Orbi

### Authentication

OK Implemented:
- Password hashing with scrypt
- Session tokens (48-byte random, SHA256 hashed)
- Timing-safe comparison for token verification
- Session TTL enforcement
- Account active status check
- Auth DTOs bound email length and require mixed-case, numeric and special
  character passwords before account creation or sign-in attempts are accepted.
- Auth, admin and payment API responses are marked `no-store` to avoid cached
  session or money data in browsers and proxies.
- Payment checkout return URLs are origin-bound to configured Orbi frontend
  origins/default redirect origin before any provider attempt is persisted.
- Admin System Health operations now use Next.js server routes backed by an
  HttpOnly, SameSite=strict admin session cookie, so incident and dead-letter
  actions no longer require exposing the backend Bearer token to that browser
  surface.
- Admin driver-wallet payout, recovery and settlement export actions also proxy
  through server routes, keeping finance mutations behind the HttpOnly admin
  session and same-origin mutation gate.
- Admin payment webhook journal actions now use the same server-route boundary
  for filtering, investigation, replay, provider verification and refunds.
- Admin support queue refresh and ticket status updates are also proxied through
  server routes, keeping incident triage behind the HttpOnly admin session.
- Admin feature-flag refreshes are read through a no-store server route instead
  of re-authenticating from the browser.
- Local admin server mutations require a same-origin request plus an explicit
  `x-orbi-admin-action: true` header, which gives the HttpOnly admin cookie
  a concrete CSRF gate instead of relying on cookie attributes alone.
- In production, the admin server session cookie uses a host-bound
  `__Host-` name with `Secure`, `HttpOnly`, `SameSite=Strict`, path `/` and
  high priority attributes. Local development keeps the legacy cookie name so
  plain `localhost` testing remains usable.
- Demo account passwords stay visible only outside production builds; the admin
  console does not render those shared test secrets in production mode.
- Persisted mobile error-report queues are normalized before replay: rider and
  driver apps discard malformed or cross-role reports and redact tokens,
  emails and phone numbers from queued text/context before backend submission.
- Rider and driver sessions use Expo `SecureStore` on native platforms and
  browser `sessionStorage` on Expo web. The web path does not fall back to
  persistent `localStorage` and ignores blocked storage APIs without crashing the
  auth surface.
- Mobile error reports can be relayed to an external HTTPS webhook collector
  after server-side redaction. Production startup now rejects the local-only
  collector mode so mobile crash/error monitoring cannot be forgotten silently.

Planned Next Phase:
- 2FA support (TOTP)
- API keys for service-to-service
- OAuth2 integration for driver onboarding
- Extend the same server-route + HttpOnly session pattern to the rest of the
  admin console before public exposure.

### Authorization

OK Implemented:
- RBAC (ADMIN, OPS, DRIVER, RIDER)
- Profile access guard (users can only access own data)
- Role-based endpoint decorators

Planned Next Phase:
- Fine-grained permissions (can_manage_pricing, can_view_analytics, etc.)
- Audit log on all privileged operations

### Data Protection

OK Implemented:
- Password hashing
- Session tokens (not stored raw)
- No sensitive data in error responses
- Partial unique indexes to prevent data corruption

Planned Next Phase:
- Encryption at rest for payment info
- PII masking in logs
- Data retention policies

### API Security

OK Implemented:
- CORS whitelist
- Production startup rejects wildcard CORS origins
- CSRF protection (via session tokens)
- Rate limiting per IP/user
- Input validation & sanitization
- No raw SQL queries (Prisma parameterized)
- Backend security headers are centralized and include CSP for API responses,
  frame denial, referrer suppression, no-sniff, DNS prefetch disablement,
  download-open protection, cross-origin opener policy and HSTS on HTTPS
  requests.
- Admin web ships browser security headers from Next.js, including CSP,
  frame denial, no-sniff, no-referrer, cross-origin opener/resource policy,
  origin-agent clustering, disabled DNS prefetch and disabled
  camera/microphone/geolocation permissions.
- Admin backend route parameters use an opaque ID pipe on sensitive operations
  to fail closed on traversal strings, script payloads, oversized identifiers
  and malformed parameter tampering before service logic or Prisma queries run.
- The global Nest validation pipe now rejects unknown root values in addition
  to stripping/rejecting unknown object fields, reducing malformed payload and
  prototype-shaped input risk before controllers execute.
- Rider, driver, ride-request and trip route identifiers now use the same
  opaque ID guard on mobile-facing protected routes.
- Structured mobile DTO fields reject short malicious strings, not only
  oversized payloads: saved-place labels/addresses, ride pickup/destination
  addresses, rider IDs, pickup codes and driver document filenames/storage keys
  are bounded and checked for traversal, control characters and markup-shaped
  input before service logic runs.
- IDOR handling on rider saved places, ride request cancellation and trip access
  now fails closed with generic `NotFound` responses for valid IDs owned by
  another rider or driver, avoiding object-existence leaks while preventing
  writes, realtime events and downstream side effects.
- Admin finance surfaces now have regression tests for RBAC metadata and dirty
  object IDs: wallet payouts, recovery adjustments, payment verification,
  refund and webhook replay handlers remain limited to `ADMIN`/`OPS`, while
  support can read wallet status without gaining mutation privileges.

Planned Next Phase:
- Continue iterative OWASP API Security Top 10 coverage on money/admin objects:
  payout ownership, refund idempotency, webhook replay authorization and export
  abuse limits.
- API rate limiting tiers, mobile request signing and DDoS protection
  (Cloudflare or equivalent).
- Mobile MASVS/MASTG lab tests for token storage, deep links, certificate
  pinning readiness and sensitive screenshots.

### Operations Security

OK Implemented:
- Audit logs for admin actions
- Graceful shutdown handling
- Health check endpoints (liveness/readiness)
- Trusted proxy configuration
- Environment variable validation
- Production startup refuses Swagger, localhost database URLs, localhost public
  URLs and non-HTTPS document storage links

Planned Next Phase:
- Centralized logging (ELK stack)
- Real-time alerting
- Incident response playbooks

## Compliance & Audit Trail

### Audit Logging

All admin/ops operations must log:

```typescript
await this.auditLog.create({
  action: 'UPDATE_PRICING',
  actor: adminUser.id,
  resourceType: 'PricingRule',
  resourceId: pricingRule.id,
  changes: { from: oldValue, to: newValue },
  timestamp: new Date(),
  ipAddress: request.ip,
  userAgent: request.get('user-agent'),
});
```

Current sensitive admin surfaces include driver onboarding review, onboarding
CSV export and onboarding export-history visibility through `AuditLog`.

### Payment Compliance

- All wallet transactions logged with timestamp & user
- Refunds tracked with reference IDs (idempotent)
- Webhook events stored for audit trail
- PCI-DSS: Don't store card data (use Stripe/Mobile Money)

### Data Retention

- User data: Keep per GDPR (allow export/deletion)
- Audit logs: Keep for 2 years (compliance)
- Transaction logs: Keep for 5 years (finance audit)
- Error logs: Purge after 90 days

## Testing & Validation

### Security Testing Checklist

Before each release:

- [ ] All 300+ tests pass
- [ ] TypeScript strict mode with no errors
- [ ] No hardcoded secrets in code
- [ ] No plaintext passwords in examples
- [ ] CORS configuration correct for environment
- [ ] Rate limiting functional
- [ ] Session TTL honored
- [ ] Password validation enforced
- [ ] Audit logs created for sensitive ops

### Dependency Updates

**Monthly:**
- Review `pnpm audit --audit-level moderate --ignore-registry-errors` report
- Identify new vulnerabilities
- Test critical updates in staging
- Merge if no regressions

**Quarterly:**
- Review `.npmrc` overrides
- Try updating to latest major versions
- Run performance benchmarks
- Update security documentation

## Incident Response

### Severity Levels

| Level | Response Time | Impact | Example |
|-------|---------------|--------|---------|
| CRITICAL | 1 hour | Production down | Database compromise |
| HIGH | 4 hours | Feature unavailable | Payment processing broken |
| MEDIUM | 24 hours | Degraded functionality | Auth bug in edge case |
| LOW | 1 week | Minor UX issue | Typo in error message |

### Response Steps

1. **Triage**: Confirm severity & affected systems
2. **Contain**: Roll back if needed, prevent propagation
3. **Fix**: Develop & test patch (MUST pass all tests)
4. **Deploy**: Use CI/CD, verify in staging first
5. **Document**: Update runbooks, post-mortem

## Production Checklist

Before deploying to production:

- [ ] All tests pass (300+ tests required)
- [ ] TypeScript no errors
- [ ] Environment variables validated
- [ ] `NODE_ENV=production` boots only with `ENABLE_SWAGGER=false`,
      explicit CORS origins, external database URL and HTTPS document URLs
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring/alerting configured
- [ ] Audit logs enabled
- [ ] HTTPS enforced
- [ ] CORS headers correct
- [ ] Rate limiting enabled
- [ ] Backup taken

## Contact & Reporting

- **Security Issues**: Do NOT open public GitHub issues
- **Email**: security@orbi.app (when set up)
- **Process**: Vulnerability → Patch → Coordinate Disclosure → Public Announce

## References

- **OWASP Top 10**: https://owasp.org/Top10/
- **OWASP Web Security Testing Guide**: https://owasp.org/www-project-web-security-testing-guide/
- **OWASP API Security Top 10**: https://owasp.org/API-Security/
- **OWASP MASVS / MASTG**: https://mas.owasp.org/
- **NIST SSDF SP 800-218**: https://csrc.nist.gov/publications/detail/sp/800-218/final
- **Node.js Security**: https://nodejs.org/en/docs/guides/security/
- **Prisma Security**: https://www.prisma.io/docs/orm/more/security
- **NestJS Security**: https://docs.nestjs.com/security/overview
