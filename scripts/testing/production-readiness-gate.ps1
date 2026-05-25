param(
  [switch]$SkipAudit,
  [switch]$SkipSecretHygiene,
  [switch]$SkipPrisma,
  [switch]$SkipBackendReadiness,
  [switch]$SkipPaymentFixtures,
  [switch]$SkipAdminSmoke,
  [switch]$SkipMobileSmoke,
  [switch]$SkipTypecheck
)

$ErrorActionPreference = "Stop"

$arguments = @(".\scripts\testing\production-readiness-gate.mjs")

if ($SkipAudit) { $arguments += "--skip-audit" }
if ($SkipSecretHygiene) { $arguments += "--skip-secret-hygiene" }
if ($SkipPrisma) { $arguments += "--skip-prisma" }
if ($SkipBackendReadiness) { $arguments += "--skip-backend-readiness" }
if ($SkipPaymentFixtures) { $arguments += "--skip-payment-fixtures" }
if ($SkipAdminSmoke) { $arguments += "--skip-admin-smoke" }
if ($SkipMobileSmoke) { $arguments += "--skip-mobile-smoke" }
if ($SkipTypecheck) { $arguments += "--skip-typecheck" }

& node @arguments

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
