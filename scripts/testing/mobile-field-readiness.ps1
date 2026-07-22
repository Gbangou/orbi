param(
  [switch]$AllowLocalhost
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing env file: $Path. Run pnpm mobile:lan first."
  }

  $match = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^$([regex]::Escape($Key))=" } |
    Select-Object -First 1

  if (-not $match) {
    throw "Missing $Key in $Path. Run pnpm mobile:lan first."
  }

  return ($match -replace "^$([regex]::Escape($Key))=", "").Trim()
}

function Test-MobileApiUrl {
  param(
    [string]$Name,
    [string]$Url
  )

  if (-not ($Url -match "^https?://")) {
    throw "$Name API URL must be http(s), got: $Url"
  }

  if (-not $AllowLocalhost -and ($Url -match "localhost|127\.0\.0\.1")) {
    throw "$Name API URL points to localhost. Phones need the PC LAN IP. Run pnpm mobile:lan."
  }
}

function Test-IsLocalApiUrl {
  param([string]$Url)

  return $Url -match "localhost|127\.0\.0\.1|0\.0\.0\.0|\.local($|/)"
}

function Test-BackendHealth {
  param([string]$ApiBaseUrl)

  $healthUrl = "$ApiBaseUrl/api/v1/health/ready"

  try {
    $response = Invoke-WebRequest -Uri $healthUrl -Method Get -UseBasicParsing -TimeoutSec 15
    $body = $response.Content | ConvertFrom-Json
    if ($response.StatusCode -eq 200 -and $body.status -eq "ready") {
      Write-Host "[ok] Backend readiness reachable: $healthUrl" -ForegroundColor Green
      return
    }

    throw "Backend readiness returned HTTP $($response.StatusCode) with status '$($body.status)': $healthUrl"
  } catch {
    if (Test-IsLocalApiUrl -Url $ApiBaseUrl) {
      throw "Backend readiness is not reachable from configured mobile URL: $healthUrl. Start pnpm dev:backend and check firewall/Wi-Fi."
    }

    throw "Backend readiness is not reachable from configured mobile URL: $healthUrl. Check public API uptime before APK generation."
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$riderEnv = Join-Path $repoRoot "apps\rider-app\.env"
$driverEnv = Join-Path $repoRoot "apps\driver-app\.env"

$riderApiBaseUrl = Read-EnvValue -Path $riderEnv -Key "EXPO_PUBLIC_API_BASE_URL"
$driverApiBaseUrl = Read-EnvValue -Path $driverEnv -Key "EXPO_PUBLIC_API_BASE_URL"
$riderApiVersion = Read-EnvValue -Path $riderEnv -Key "EXPO_PUBLIC_API_VERSION"
$driverApiVersion = Read-EnvValue -Path $driverEnv -Key "EXPO_PUBLIC_API_VERSION"

Write-Host "Orbi mobile field readiness" -ForegroundColor White
Write-Host "Rider API:  $riderApiBaseUrl ($riderApiVersion)"
Write-Host "Driver API: $driverApiBaseUrl ($driverApiVersion)"

Write-Section "Environment"
Test-MobileApiUrl -Name "Rider" -Url $riderApiBaseUrl
Test-MobileApiUrl -Name "Driver" -Url $driverApiBaseUrl

if ($riderApiBaseUrl -ne $driverApiBaseUrl) {
  throw "Rider and driver apps point to different API URLs. Run pnpm mobile:lan again."
}

if ($riderApiVersion -ne "v1" -or $driverApiVersion -ne "v1") {
  throw "Mobile API version must be v1 for this MVP field check."
}

Write-Host "[ok] Mobile env files are aligned." -ForegroundColor Green

Write-Section "Backend"
Test-BackendHealth -ApiBaseUrl $riderApiBaseUrl

Write-Section "Next"
if (Test-IsLocalApiUrl -Url $riderApiBaseUrl) {
  Write-Host "1. Keep PC and phones on the same Wi-Fi."
  Write-Host "2. Keep pnpm dev:backend running."
  Write-Host "3. Run pnpm dev:rider and scan with Expo Go."
  Write-Host "4. Run pnpm dev:driver and scan with Expo Go on the driver phone."
  Write-Host "5. Complete the field checklist in docs/local-e2e-field-session.md."
} else {
  Write-Host "1. Keep rider and driver apps on the same API URL shown above."
  Write-Host "2. Use field accounts connected to the public backend."
  Write-Host "3. Confirm driver identity, plate check, cancel-before-departure and start/finish on two real phones."
  Write-Host "4. Complete the MVP checklist in docs/mvp-real-device-testing-guide.md."
}
