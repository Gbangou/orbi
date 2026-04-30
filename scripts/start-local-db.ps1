$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repoRoot 'apps\backend'
$maxAttempts = 24
$sleepSeconds = 5

try {
  docker version | Out-Null
}
catch {
  Write-Error 'Docker Desktop is not running. Start Docker Desktop, wait until it says it is running, then rerun pnpm db:start.'
}

Push-Location $backendPath
try {
  docker compose up -d db
  $containerId = docker compose ps -q db

  if (-not $containerId) {
    throw 'Unable to resolve the PostgreSQL container id after docker compose up.'
  }

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $healthStatus = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId

    if ($healthStatus -eq 'healthy' -or $healthStatus -eq 'running') {
      Write-Host ''
      Write-Host "PostgreSQL is ready on localhost:5433 (status: $healthStatus)."
      Write-Host 'Next steps:'
      Write-Host '1. Run pnpm prisma:generate'
      Write-Host '2. Run pnpm prisma:migrate'
      Write-Host '3. Run pnpm prisma:seed'
      return
    }

    Start-Sleep -Seconds $sleepSeconds
  }

  throw 'PostgreSQL did not become ready in time. Check Docker Desktop and container logs.'
}
finally {
  Pop-Location
}
