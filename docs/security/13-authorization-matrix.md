# Orbi Authorization Matrix

Date: 2026-08-10

## Roles Confirmed In Code

`UserRole` in Prisma currently contains:

| Requested role | Implemented role | Status |
| --- | --- | --- |
| Rider | `RIDER` | Active |
| Driver | `DRIVER` | Active |
| Support | `SUPPORT` | Active |
| Operations | `OPS` | Active |
| Finance | none | Not implemented |
| Admin | `ADMIN` | Active |
| Super Admin | none | Not implemented |

Do not grant finance or super-admin behavior by convention alone. Add explicit enum values, API policy, UI filtering, migration and tests before those roles are used.

## Enforcement Layers

| Layer | Current mechanism | Rule |
| --- | --- | --- |
| Authentication | `SessionAuthGuard` | Loads `request.auth` from a valid, non-revoked session. |
| Function authorization | `@Roles(...)` + `RolesGuard` | Endpoints must declare allowed roles. Missing roles must deny. |
| Profile gating | `ProfileAccessGuard` | Rider/driver routes require matching profile presence. |
| Resource ownership | Service queries and assertions | User-facing resource access must bind IDs to `auth.user.id` or the authenticated profile. |
| Admin sensitive actions | Service validation + audit log | Sensitive changes require `ADMIN` or `OPS`, a reason, actor and before/after audit metadata. |

## Admin Matrix

| Surface | Allowed roles | Notes |
| --- | --- | --- |
| Live operations, readiness, jobs read, trips audit read | `ADMIN`, `OPS`, `SUPPORT` | Support gets operational visibility only. |
| Drivers/riders/support ticket read | `ADMIN`, `OPS`, `SUPPORT` | User lists remain admin-console only. |
| Finance dashboard | `ADMIN`, `OPS` | `SUPPORT` removed because no `FINANCE` role exists yet. |
| Driver wallets | `ADMIN`, `OPS` | Wallet balances and payout data are financial. |
| Payment webhook events/detail/investigation | `ADMIN`, `OPS` | Payment traces are financial/operational, not support-wide. |
| Payment webhook replay, provider verification, refund | `ADMIN`, `OPS` | Sensitive money operations. |
| Driver payout prepare/mark paid/recovery adjustment | `ADMIN`, `OPS` | Requires operations note and audit before/after metadata. |
| Driver onboarding queue and document view | `ADMIN`, `OPS`, `SUPPORT` | Document lookup binds `documentId` to `driverProfileId`. |
| Driver onboarding decision/object verification | `ADMIN`, `OPS` | Decisions require role authority and reason where applicable. |
| Driver suspend | `ADMIN`, `OPS` | Sensitive account action; audit required. |
| Driver reactivate | `ADMIN` | Higher risk than suspension. |
| Promo codes create/delete | `ADMIN` | Commercial control. |

## IDOR Checklist

| Resource ID changed by attacker | Required server-side check | Observed/corrected status |
| --- | --- | --- |
| `userId` | Admin-only route plus target role validation where relevant. User self-service uses `auth.user.id`, not route user IDs. | Existing pattern confirmed in auth/export/delete and admin user services. |
| `driverId` | Driver resources must bind to authenticated driver profile, or admin routes must be role-guarded. | Existing driver/user services use profile ownership or admin guards. |
| `riderId` | Rider resources must bind to authenticated rider profile or `auth.user.id`. | Existing rider and wallet top-up flows use `auth.user.id`. |
| `tripId` | Rider must match trip rider user; driver must match assigned driver user; admins use guarded audit routes. | Existing trip security tests cover wrong rider/driver access. |
| `paymentId` / payment attempt ID | User payment operations must bind to `auth.user.id`; admin payment operations require `ADMIN`/`OPS`. | Admin payment reads tightened; support no longer sees webhook/payment endpoints. |
| `walletId` | Wallet must belong to a driver for driver payout admin actions; rider top-up resolves wallet by `auth.user.id`. | Driver wallet service checks `wallet.user.role === DRIVER`; admin read restricted to `ADMIN`/`OPS`. |
| `documentId` | Document lookup must include both `id` and `driverProfileId`. | Confirmed in document view and object verification services. |
| `supportTicketId` | User-created tickets must bind to `auth.user.id`; admin ticket actions must be role-guarded and audited. | Admin ticket actions remain `ADMIN`/`OPS`/`SUPPORT`; compensation stays `ADMIN`/`OPS`. |

## Audit Requirements

Sensitive admin audit entries must include:

| Field | Meaning |
| --- | --- |
| Role authorized | The endpoint `@Roles(...)` and audit metadata `authorizedRoles`. |
| Reason | Human operations note, decision reason or compensation reason. |
| Actor | `auth.user.id`, role and name where available. |
| Date | `AuditLog.createdAt` plus `metadata.actedAt` for high-risk money operations. |
| Old value | Prior status/balance/value snapshot. |
| New value | New status/balance/value snapshot. |
| Correlation ID | Idempotency key, payout reference, payment reference or deterministic operation reference. |
| Audit trace | `AuditLog` row tied to the target entity. |

Implemented hardening in this pass:

| Action | Correction |
| --- | --- |
| Driver payout prepare | Requires a non-empty operations note; audit now includes actor, authorized roles, reason, actedAt, correlationId, oldValue and newValue. |
| Driver wallet recovery adjustment | Existing idempotency key kept; audit now includes actor, authorized roles, reason, actedAt, correlationId, oldValue and newValue. |
| Driver payout paid | Requires a non-empty operations note; audit now includes actor, authorized roles, reason, actedAt, correlationId, oldValue and newValue. |
| Financial admin reads | Removed `SUPPORT` from finance dashboard, driver wallets and payment webhook read/investigation endpoints. |

## Required Follow-Up Before Introducing Finance/Super Admin

1. Add `FINANCE` and/or `SUPER_ADMIN` to `UserRole` with a migration.
2. Update `@Roles(...)` on finance, payout, refund, webhook and export endpoints.
3. Add admin-web permissions so hidden actions are also unavailable in the UI.
4. Add security tests for each new role, including downgrade/role-change session behavior.
5. Backfill or migrate existing admin accounts intentionally; do not silently promote `ADMIN` users.

## Verification

Executed:

```text
pnpm --filter backend test -- admin.controller.security.spec.ts --runInBand
```

Result: passed, 121 tests.

