param(
  [switch]$SkipTypecheck,
  [switch]$SkipAudit,
  [switch]$SkipFullBackend
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
    throw "Security local gate failed at '$Name' with exit code $LASTEXITCODE."
  }

  $duration = (Get-Date) - $startedAt
  Write-Host ("[ok] {0} passed in {1:n1}s" -f $Name, $duration.TotalSeconds) -ForegroundColor Green
}

Write-Host "Mobilis local security gate" -ForegroundColor White
Write-Host "SkipAudit:       $SkipAudit"
Write-Host "SkipTypecheck:   $SkipTypecheck"
Write-Host "SkipFullBackend: $SkipFullBackend"

if (-not $SkipAudit) {
  Invoke-Gate -Name "SCA dependency audit" -Executable "pnpm" -Arguments @(
    "audit",
    "--audit-level",
    "moderate"
  )
}

Invoke-Gate -Name "Prisma schema validation" -Executable "pnpm" -Arguments @(
  "--filter",
  "backend",
  "exec",
  "prisma",
  "validate"
)

if (-not $SkipFullBackend) {
  Invoke-Gate -Name "Backend security and domain tests" -Executable "pnpm" -Arguments @(
    "--filter",
    "backend",
    "test",
    "--runInBand"
  )
} else {
  Invoke-Gate -Name "Backend dirty input tests" -Executable "pnpm" -Arguments @(
    "--filter",
    "backend",
    "test",
    "dirty-input-validation.spec.ts",
    "--runInBand"
  )

  Invoke-Gate -Name "Backend auth tests" -Executable "pnpm" -Arguments @(
    "--filter",
    "backend",
    "test",
    "auth",
    "--runInBand"
  )

  Invoke-Gate -Name "Backend payments tests" -Executable "pnpm" -Arguments @(
    "--filter",
    "backend",
    "test",
    "payments.service.spec.ts",
    "--runInBand"
  )
}

Invoke-Gate -Name "Admin smoke tests" -Executable "pnpm" -Arguments @(
  "test:admin:smoke"
)

Invoke-Gate -Name "Mobile smoke tests" -Executable "pnpm" -Arguments @(
  "test:mobile:smoke"
)

if (-not $SkipTypecheck) {
  Invoke-Gate -Name "Workspace typecheck and builds" -Executable "pnpm" -Arguments @(
    "typecheck"
  )
}

Write-Section "Result"
Write-Host "[ok] Local security gate completed." -ForegroundColor Green
