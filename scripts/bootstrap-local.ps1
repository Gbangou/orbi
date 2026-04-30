$ErrorActionPreference = 'Stop'

function Ensure-FileFromExample {
  param(
    [string]$TargetPath,
    [string]$ExamplePath
  )

  if (-not (Test-Path -LiteralPath $TargetPath)) {
    Copy-Item -LiteralPath $ExamplePath -Destination $TargetPath
    Write-Host "Created $TargetPath from example."
  }
  else {
    Write-Host "Kept existing $TargetPath."
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot

Ensure-FileFromExample `
  -TargetPath (Join-Path $repoRoot 'apps\backend\.env') `
  -ExamplePath (Join-Path $repoRoot 'apps\backend\.env.example')

Ensure-FileFromExample `
  -TargetPath (Join-Path $repoRoot 'apps\backend\prisma\.env') `
  -ExamplePath (Join-Path $repoRoot 'apps\backend\prisma\.env.example')

Ensure-FileFromExample `
  -TargetPath (Join-Path $repoRoot 'apps\admin-web\.env.local') `
  -ExamplePath (Join-Path $repoRoot 'apps\admin-web\.env.example')

Ensure-FileFromExample `
  -TargetPath (Join-Path $repoRoot 'apps\rider-app\.env') `
  -ExamplePath (Join-Path $repoRoot 'apps\rider-app\.env.example')

Ensure-FileFromExample `
  -TargetPath (Join-Path $repoRoot 'apps\driver-app\.env') `
  -ExamplePath (Join-Path $repoRoot 'apps\driver-app\.env.example')

Write-Host ''
Write-Host 'Local environment files are ready.'
Write-Host 'Next recommended steps:'
Write-Host '1. Start Docker Desktop.'
Write-Host '2. Run pnpm db:start'
Write-Host '3. Wait until the script confirms PostgreSQL is ready on localhost:5433'
Write-Host '4. Run pnpm prisma:generate'
Write-Host '5. Run pnpm prisma:migrate'
Write-Host '6. Run pnpm prisma:seed'
Write-Host '7. Run pnpm dev:full-web or pnpm dev:full-mobile'
