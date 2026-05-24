param(
  [string]$ApiBaseUrl = "http://localhost:3000",
  [string]$AdminUrl = "http://localhost:3001",
  [int[]]$ExpoPorts = @(8081, 8082, 8083)
)

$ErrorActionPreference = "Stop"
$ApiRoot = "$ApiBaseUrl/api/v1"
$HasBlockingIssue = $false

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)

  Write-Host "[ok] $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)

  Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)

  $script:HasBlockingIssue = $true
  Write-Host "[fail] $Message" -ForegroundColor Red
}

function Test-Http {
  param(
    [string]$Name,
    [string]$Url,
    [int[]]$AcceptedStatusCodes = @(200),
    [switch]$Required
  )

  try {
    $response = Invoke-WebRequest `
      -Uri $Url `
      -Method Get `
      -UseBasicParsing `
      -TimeoutSec 5 `
      -SkipHttpErrorCheck

    if ($AcceptedStatusCodes -contains $response.StatusCode) {
      Write-Ok "$Name reachable ($($response.StatusCode)): $Url"
      return $true
    }

    if ($Required) {
      Write-Fail "$Name returned HTTP $($response.StatusCode): $Url"
    } else {
      Write-Warn "$Name returned HTTP $($response.StatusCode): $Url"
    }
    return $false
  } catch {
    if ($Required) {
      Write-Fail "$Name not reachable: $Url"
    } else {
      Write-Warn "$Name not reachable yet: $Url"
    }
    return $false
  }
}

function Test-DemoSignIn {
  param(
    [string]$Role,
    [string]$Email
  )

  try {
    $body = @{
      email = $Email
      password = "Orbi123!"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
      -Uri "$ApiRoot/auth/sign-in" `
      -Method Post `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 8

    if ($response.sessionToken -and $response.user.role) {
      Write-Ok "$Role demo account signs in as $($response.user.role): $Email"
      return
    }

    Write-Fail "$Role demo account sign-in returned an unexpected response: $Email"
  } catch {
    $message = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $message = $_.ErrorDetails.Message
    }

    Write-Fail "$Role demo account cannot sign in: $Email ($message)"
  }
}

function Test-DockerDatabase {
  $tcpOpen = $false
  try {
    $tcpClient = [System.Net.Sockets.TcpClient]::new()
    $connectTask = $tcpClient.ConnectAsync("127.0.0.1", 5433)
    $tcpOpen = $connectTask.Wait(1000) -and $tcpClient.Connected
    $tcpClient.Dispose()
  } catch {
    $tcpOpen = $false
  }

  if ($tcpOpen) {
    Write-Ok "PostgreSQL port is open on localhost:5433."
    return
  }

  try {
    $containers = docker ps --format "{{.Names}}|{{.Status}}|{{.Ports}}" 2>$null
  } catch {
    Write-Warn "Docker is not available from this terminal. Open Docker Desktop, then run pnpm db:start."
    return
  }

  $db = $containers | Where-Object { $_ -match "backend-db-1" }
  if ($db) {
    Write-Ok "PostgreSQL Docker container is running: $db"
    return
  }

  Write-Warn "PostgreSQL container backend-db-1 is not running. Run pnpm db:start."
}

Write-Host "Orbi local doctor" -ForegroundColor White
Write-Host "API:   $ApiBaseUrl"
Write-Host "Admin: $AdminUrl"

Write-Section "Database"
Test-DockerDatabase

Write-Section "Backend"
$backendHealthy = Test-Http `
  -Name "Backend health" `
  -Url "$ApiRoot/health" `
  -AcceptedStatusCodes @(200) `
  -Required

Test-Http `
  -Name "Backend Swagger docs" `
  -Url "$ApiBaseUrl/docs" `
  -AcceptedStatusCodes @(200, 301, 302) | Out-Null

Write-Host ""
Write-Host "Note: $ApiBaseUrl alone can return 'Cannot GET /'. That is normal; use $ApiBaseUrl/docs." -ForegroundColor Gray

Write-Section "Demo Accounts"
if ($backendHealthy) {
  Test-DemoSignIn -Role "Admin" -Email "admin@orbi.app"
  Test-DemoSignIn -Role "Rider" -Email "rider@orbi.app"
  Test-DemoSignIn -Role "Driver" -Email "driver@orbi.app"
} else {
  Write-Warn "Skipping demo sign-in checks until the backend is reachable."
}

Write-Section "Web Surfaces"
Test-Http `
  -Name "Admin web" `
  -Url $AdminUrl `
  -AcceptedStatusCodes @(200, 307, 308) | Out-Null

$foundExpo = $false
foreach ($port in $ExpoPorts) {
  $url = "http://localhost:$port"
  try {
    $response = Invoke-WebRequest `
      -Uri $url `
      -Method Get `
      -UseBasicParsing `
      -TimeoutSec 3 `
      -SkipHttpErrorCheck

    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $foundExpo = $true
      Write-Ok "Expo web appears reachable on $url ($($response.StatusCode)). Open the exact Expo URL shown in the terminal."
    }
  } catch {
    Write-Host "[info] No Expo web server on $url" -ForegroundColor DarkGray
  }
}

if (-not $foundExpo) {
  Write-Warn "No Expo web server found on the common ports. Run pnpm dev:full-web for rider or pnpm dev:web-driver-preview for driver."
}

Write-Section "Next Commands"
if (-not $backendHealthy) {
  Write-Host "Run these first:"
  Write-Host "  pnpm db:start"
  Write-Host "  pnpm prisma:migrate"
  Write-Host "  pnpm prisma:seed"
  Write-Host "  pnpm dev:full-web"
} else {
  Write-Host "For rider web:"
  Write-Host "  pnpm dev:full-web"
  Write-Host ""
  Write-Host "For driver web:"
  Write-Host "  Ctrl+C the rider stack, then run pnpm dev:web-driver-preview"
  Write-Host ""
  Write-Host "For API-only E2E:"
  Write-Host "  pnpm e2e:local-api"
}

if ($HasBlockingIssue) {
  Write-Host ""
  Write-Host "Local doctor found blocking issues." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Local doctor finished. Any remaining warnings are usually launch-order or port issues." -ForegroundColor Green
