param(
  [switch]$SkipAudit,
  [switch]$SkipPrisma,
  [switch]$SkipBackendReadiness,
  [switch]$SkipAdminSmoke,
  [switch]$SkipMobileSmoke,
  [switch]$SkipTypecheck
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Invoke-Gate {
  param(
    [string]$Name,
    [string]$Executable,
    [string[]]$Arguments
  )

  Write-Section $Name
  Write-Host ("> {0} {1}" -f $Executable, ($Arguments -join " ")) -ForegroundColor DarkGray

  $startedAt = Get-Date
  & $Executable @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "Production readiness gate failed at '$Name' with exit code $LASTEXITCODE."
  }

  $duration = (Get-Date) - $startedAt
  Write-Host ("[ok] {0} passed in {1:n1}s" -f $Name, $duration.TotalSeconds) -ForegroundColor Green
}

Write-Host "Orbi production readiness gate" -ForegroundColor White
Write-Host "SkipAudit:            $SkipAudit"
Write-Host "SkipPrisma:           $SkipPrisma"
Write-Host "SkipBackendReadiness: $SkipBackendReadiness"
Write-Host "SkipAdminSmoke:       $SkipAdminSmoke"
Write-Host "SkipMobileSmoke:      $SkipMobileSmoke"
Write-Host "SkipTypecheck:        $SkipTypecheck"

Invoke-Gate -Name "Whitespace diff check" -Executable "git" -Arguments @(
  "diff",
  "--check"
)

if (-not $SkipAudit) {
  Invoke-Gate -Name "SCA dependency audit" -Executable "pnpm" -Arguments @(
    "audit",
    "--audit-level",
    "moderate"
  )
}

if (-not $SkipPrisma) {
  Invoke-Gate -Name "Prisma schema validation" -Executable "pnpm" -Arguments @(
    "--filter",
    "backend",
    "exec",
    "prisma",
    "validate"
  )
}

if (-not $SkipBackendReadiness) {
  Invoke-Gate -Name "Backend production readiness specs" -Executable "pnpm" -Arguments @(
    "--filter",
    "backend",
    "test",
    "environment.validation",
    "health.service",
    "configurable-rate-limit.store",
    "configurable-realtime.transport",
    "mobile-error-collector",
    "--runInBand"
  )
}

if (-not $SkipAdminSmoke) {
  Invoke-Gate -Name "Admin smoke tests" -Executable "pnpm" -Arguments @(
    "test:admin:smoke"
  )
}

if (-not $SkipMobileSmoke) {
  Invoke-Gate -Name "Mobile smoke tests" -Executable "pnpm" -Arguments @(
    "test:mobile:smoke"
  )
}

if (-not $SkipTypecheck) {
  Invoke-Gate -Name "Workspace typecheck and builds" -Executable "pnpm" -Arguments @(
    "typecheck"
  )
}

Write-Section "Result"
Write-Host "[ok] Production readiness gate completed." -ForegroundColor Green
