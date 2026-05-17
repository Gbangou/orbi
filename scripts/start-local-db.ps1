$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repoRoot 'apps\backend'
$maxAttempts = 24
$sleepSeconds = 5
$dockerDesktopPipe = '\\.\pipe\dockerDesktopLinuxEngine'

function Invoke-NativeCommand {
  param(
    [scriptblock]$Command,
    [string]$FailureMessage
  )

  $output = & $Command
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }

  return $output
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host 'Docker CLI was not found. Install Docker Desktop, start it, then rerun pnpm db:start.' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath $dockerDesktopPipe)) {
  Write-Host 'Docker Desktop is not running. Start Docker Desktop, wait until it says it is running, then rerun pnpm db:start.' -ForegroundColor Red
  exit 1
}

Push-Location $backendPath
try {
  Invoke-NativeCommand `
    -Command { docker compose up -d db } `
    -FailureMessage 'Unable to start the PostgreSQL container with docker compose.' |
    Out-Null

  $containerId = Invoke-NativeCommand `
    -Command { docker compose ps -q db } `
    -FailureMessage 'Unable to inspect the PostgreSQL container with docker compose.'

  if (-not $containerId) {
    throw 'Unable to resolve the PostgreSQL container id after docker compose up.'
  }

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $hasHealthcheck = Invoke-NativeCommand `
      -Command { docker inspect --format '{{if .State.Health}}true{{else}}false{{end}}' $containerId } `
      -FailureMessage 'Unable to inspect PostgreSQL container healthcheck.'
    $healthStatus = Invoke-NativeCommand `
      -Command { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId } `
      -FailureMessage 'Unable to inspect PostgreSQL container status.'

    if ($healthStatus -eq 'healthy' -or ($hasHealthcheck -eq 'false' -and $healthStatus -eq 'running')) {
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

  throw 'PostgreSQL did not become healthy in time. Check Docker Desktop and container logs.'
}
finally {
  Pop-Location
}
