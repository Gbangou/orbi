param(
  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,

  [string]$AdminUrl,

  [int]$TimeoutSec = 90,

  [int]$PollSeconds = 3
)

$ErrorActionPreference = "Stop"

function Fail {
  param([string]$Message)

  Write-Error $Message
  exit 1
}

function Invoke-FieldWebRequest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri,

    [string]$Method = "Get"
  )

  $request = @{
    Uri             = $Uri
    Method          = $Method
    UseBasicParsing = $true
    TimeoutSec      = 15
  }

  if ((Get-Command Invoke-WebRequest).Parameters.ContainsKey("NoProxy")) {
    $request.NoProxy = $true
  }

  Invoke-WebRequest @request
}

$ApiUrl = $ApiUrl.TrimEnd("/")
$AdminUrl = $AdminUrl.TrimEnd("/")

if (-not ($ApiUrl -match "^https://")) {
  Fail "ApiUrl must start with https:// for real mobile field testing: $ApiUrl"
}

if ($ApiUrl -match "localhost|127\.0\.0\.1|0\.0\.0\.0|\.local($|/)") {
  Fail "ApiUrl must be a public stable URL, not a local address: $ApiUrl"
}

if ($AdminUrl) {
  if (-not ($AdminUrl -match "^https://")) {
    Fail "AdminUrl must start with https:// for field operations: $AdminUrl"
  }

  if ($AdminUrl -match "localhost|127\.0\.0\.1|0\.0\.0\.0|\.local($|/)") {
    Fail "AdminUrl must be public and stable, not local: $AdminUrl"
  }
}

$readyUrl = "$ApiUrl/api/v1/health/ready"
$healthUrl = "$ApiUrl/api/v1/health"
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$lastError = $null

Write-Host "Checking public Orbi field API" -ForegroundColor White
Write-Host "Ready URL: $readyUrl"
if ($AdminUrl) {
  Write-Host "Admin URL: $AdminUrl"
}

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-FieldWebRequest -Uri $readyUrl
    $body = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -eq 200 -and $body.status -eq "ready") {
      Write-Host "[ok] Public API is ready." -ForegroundColor Green
      Write-Host "Dependencies: database=$($body.dependencies.database), rateLimit=$($body.dependencies.rateLimit), realtime=$($body.dependencies.realtime), driverReservationExpiry=$($body.dependencies.driverReservationExpiry)"
      if ($AdminUrl) {
        $adminResponse = Invoke-FieldWebRequest -Uri $AdminUrl -Method Head
        if ($adminResponse.StatusCode -lt 200 -or $adminResponse.StatusCode -ge 400) {
          Fail "Admin returned HTTP $($adminResponse.StatusCode): $AdminUrl"
        }
        Write-Host "[ok] Admin web is reachable." -ForegroundColor Green
      }
      exit 0
    }

    $lastError = "HTTP $($response.StatusCode), status=$($body.status)"
  } catch {
    $lastError = $_.Exception.Message
    try {
      $healthResponse = Invoke-FieldWebRequest -Uri $healthUrl
      $healthBody = $healthResponse.Content | ConvertFrom-Json
      $dependencies = $healthBody.dependencies
      if ($dependencies) {
        $lastError = "$lastError. Health status=$($healthBody.status), database=$($dependencies.database), rateLimit=$($dependencies.rateLimit), realtime=$($dependencies.realtime), driverReservationExpiry=$($dependencies.driverReservationExpiry)"
      }
    } catch {
      $lastError = "$lastError. Health details unavailable: $($_.Exception.Message)"
    }
  }

  Write-Host "[wait] Not ready yet: $lastError" -ForegroundColor Yellow
  Start-Sleep -Seconds $PollSeconds
}

Fail "Public API did not become ready within ${TimeoutSec}s. Last error: $lastError"
