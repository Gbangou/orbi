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

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Command 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    $details = ($output | Out-String).Trim()

    if ($details -match 'Access is denied' -and $details -match 'dockerDesktopLinuxEngine') {
      throw "$FailureMessage Docker Desktop denied access to its Linux engine. Open Docker Desktop, wait until it is fully running, then rerun pnpm db:start from a PowerShell session that can access Docker."
    }

    if ($details) {
      throw "$FailureMessage`n$details"
    }

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
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
finally {
  Pop-Location
}
