param(
  [switch]$SkipAudit,
  [switch]$SkipPrisma,
  [switch]$SkipBackendReadiness,
  [switch]$SkipAdminSmoke,
  [switch]$SkipMobileSmoke,
  [switch]$SkipTypecheck
)

$ErrorActionPreference = "Stop"

$arguments = @(".\scripts\testing\production-readiness-gate.mjs")

if ($SkipAudit) { $arguments += "--skip-audit" }
if ($SkipPrisma) { $arguments += "--skip-prisma" }
if ($SkipBackendReadiness) { $arguments += "--skip-backend-readiness" }
if ($SkipAdminSmoke) { $arguments += "--skip-admin-smoke" }
if ($SkipMobileSmoke) { $arguments += "--skip-mobile-smoke" }
if ($SkipTypecheck) { $arguments += "--skip-typecheck" }

& node @arguments

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
