# Mobilis Security Policy & Vulnerability Management

*Last updated: May 5, 2026*

## Current Security Status

OK **Application Security**: PRODUCTION-GRADE
OK **Authentication**: Scrypt + timing-safe comparison
OK **Input Validation**: class-validator with whitelist mode
OK **Authorization**: RBAC with session-based guards
OK **Security Headers**: All critical headers present

Warning **Dependency Vulnerabilities**: 78 known issues
- 1 CRITICAL (Handlebars.js)
- Multiple HIGH (tar, minimatch, serialize-javascript, etc.)
- Mostly in dev/test dependencies (ts-jest, @babel plugins)

## Vulnerability Assessment

### Critical Issues (MUST FIX)

| Package | Severity | Issue | Impact | Fix |
|---------|----------|-------|--------|-----|
| handlebars | CRITICAL | JavaScript Injection via AST | Dev/build tool | Upgrade >=4.7.9 |
| tar | HIGH | File overwrite via hardlink | Expo CLI dependency | Upgrade >=7.5.7 |

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
3. Add .npmrc security overrides for critical packages
4. Run full test suite (should still pass)
5. Commit with security focus

## Security Best Practices for Mobilis

### Authentication

OK Implemented:
- Password hashing with scrypt
- Session tokens (48-byte random, SHA256 hashed)
- Timing-safe comparison for token verification
- Session TTL enforcement
- Account active status check

Planned Next Phase:
- 2FA support (TOTP)
- API keys for service-to-service
- OAuth2 integration for driver onboarding

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
- CSRF protection (via session tokens)
- Rate limiting per IP/user
- Input validation & sanitization
- No raw SQL queries (Prisma parameterized)

Planned Next Phase:
- API rate limiting tiers
- Request signing for mobile
- DDoS protection (Cloudflare)

### Operations Security

OK Implemented:
- Audit logs for admin actions
- Graceful shutdown handling
- Health check endpoints (liveness/readiness)
- Trusted proxy configuration
- Environment variable validation

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
- Review `pnpm audit` report
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
- **Email**: security@mobilis.app (when set up)
- **Process**: Vulnerability → Patch → Coordinate Disclosure → Public Announce

## References

- **OWASP Top 10**: https://owasp.org/Top10/
- **Node.js Security**: https://nodejs.org/en/docs/guides/security/
- **Prisma Security**: https://www.prisma.io/docs/orm/more/security
- **NestJS Security**: https://docs.nestjs.com/security/overview
