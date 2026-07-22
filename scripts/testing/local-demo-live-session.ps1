param(
  [string]$ApiBaseUrl = "http://localhost:3000",
  [int]$Cycles = 6,
  [int]$IntervalSeconds = 2,
  [switch]$StartTrip
)

$ErrorActionPreference = "Stop"
$ApiRoot = "$ApiBaseUrl/api/v1"
$RunId = Get-Date -Format "yyyyMMddHHmmss"

function Write-Step {
  param([string]$Message)
  Write-Host "[demo-live] $Message" -ForegroundColor Cyan
}

function Stop-DemoLiveSession {
  param([string]$Message)
  throw "Local demo live session failed: $Message"
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = "",
    [hashtable]$ExtraHeaders = @{}
  )

  $headers = @{}
  foreach ($key in $ExtraHeaders.Keys) {
    $headers[$key] = $ExtraHeaders[$key]
  }

  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $parameters = @{
    Method = $Method
    Uri = "$ApiRoot$Path"
    Headers = $headers
    TimeoutSec = 15
  }

  if ($null -ne $Body) {
    $parameters["ContentType"] = "application/json"
    $parameters["Body"] = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    return Invoke-RestMethod @parameters
  } catch {
    $message = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $message = $_.ErrorDetails.Message
    }

    Stop-DemoLiveSession "$Method $Path -> $message"
  }
}

function Request-SessionToken {
  param(
    [string]$Email,
    [string]$ExpectedRole
  )

  $response = Invoke-Json -Method "POST" -Path "/auth/sign-in" -Body @{
    email = $Email
    password = "Orbi123!"
  }

  if (!$response.sessionToken) {
    Stop-DemoLiveSession "sign-in returned no session token for $Email"
  }

  $me = Invoke-Json -Method "GET" -Path "/auth/me" -Token $response.sessionToken
  if ($me.user.role -ne $ExpectedRole) {
    Stop-DemoLiveSession "$Email signed in as $($me.user.role), expected $ExpectedRole"
  }

  return $response.sessionToken
}

function Cancel-OpenRiderFlows {
  param([string]$RiderToken)

  $history = Invoke-Json -Method "GET" -Path "/trips/mine" -Token $RiderToken
  $activeTrips = @($history.recentTrips | Where-Object {
      @("MATCHED", "DRIVER_ARRIVING", "IN_PROGRESS") -contains $_.status
    })

  foreach ($trip in $activeTrips) {
    Write-Step "Cancelling rider active trip $($trip.id)"
    Invoke-Json -Method "PATCH" -Path "/trips/$($trip.id)/status" -Token $RiderToken -Body @{
      status = "CANCELLED"
    } | Out-Null
  }

  $pendingRequests = @($history.pendingRequests | Where-Object {
      @("REQUESTED", "MATCHING", "ACCEPTED") -contains $_.status
    })

  foreach ($request in $pendingRequests) {
    Write-Step "Cancelling rider pending request $($request.id)"
    Invoke-Json -Method "DELETE" -Path "/ride-requests/$($request.id)" -Token $RiderToken | Out-Null
  }
}

function Cancel-OpenDriverTrips {
  param([string]$DriverToken)

  $history = Invoke-Json -Method "GET" -Path "/trips/mine" -Token $DriverToken
  $activeTrips = @($history.recentTrips | Where-Object {
      @("MATCHED", "DRIVER_ARRIVING", "IN_PROGRESS") -contains $_.status
    })

  foreach ($trip in $activeTrips) {
    Write-Step "Cancelling driver active trip $($trip.id)"
    Invoke-Json -Method "PATCH" -Path "/trips/$($trip.id)/status" -Token $DriverToken -Body @{
      status = "CANCELLED"
    } | Out-Null
  }
}

function Record-Positions {
  param(
    [string]$TripId,
    [string]$DriverToken,
    [array]$Positions,
    [string]$DistanceField
  )

  $lastDistance = $null
  $cyclesToRun = [Math]::Max(1, $Cycles)

  for ($index = 0; $index -lt $cyclesToRun; $index++) {
    $position = $Positions[[Math]::Min($index, $Positions.Count - 1)]
    $signal = Invoke-Json -Method "POST" -Path "/trips/$TripId/route-position" -Token $DriverToken -Body $position
    $latestPosition = $signal.routeMonitoring.latestPosition
    $distance = $latestPosition.$DistanceField

    if ($null -eq $distance) {
      Stop-DemoLiveSession "route signal did not expose $DistanceField"
    }

    if ($null -ne $lastDistance -and [double]$distance -gt [double]$lastDistance + 0.05) {
      Stop-DemoLiveSession "$DistanceField moved backwards from $lastDistance to $distance"
    }

    $lastDistance = $distance
    Write-Host ("[move] {0}/{1} lat={2} lng={3} {4}={5} km" -f ($index + 1), $cyclesToRun, $position.latitude, $position.longitude, $DistanceField, $distance) -ForegroundColor Green

    if ($index -lt $cyclesToRun - 1 -and $IntervalSeconds -gt 0) {
      Start-Sleep -Seconds $IntervalSeconds
    }
  }
}

Write-Step "Checking backend health at $ApiRoot/health"
try {
  Invoke-Json -Method "GET" -Path "/health" | Out-Null
} catch {
  Write-Host ""
  Write-Host "Backend is not reachable. Start the local stack first:" -ForegroundColor Yellow
  Write-Host "  pnpm db:start"
  Write-Host "  pnpm prisma:migrate"
  Write-Host "  pnpm prisma:seed"
  Write-Host "  pnpm dev:backend"
  throw
}

Write-Step "Signing in seeded demo accounts"
$adminToken = Request-SessionToken -Email "admin@orbi.app" -ExpectedRole "ADMIN"
$riderToken = Request-SessionToken -Email "rider@orbi.app" -ExpectedRole "RIDER"
$driverToken = Request-SessionToken -Email "driver@orbi.app" -ExpectedRole "DRIVER"

Write-Step "Clearing previous open demo flows"
Cancel-OpenRiderFlows -RiderToken $riderToken
Cancel-OpenDriverTrips -DriverToken $driverToken

Write-Step "Putting demo driver online near the rider pickup"
Invoke-Json -Method "PATCH" -Path "/drivers/availability" -Token $driverToken -Body @{
  status = "ONLINE"
} | Out-Null
Invoke-Json -Method "PATCH" -Path "/drivers/presence" -Token $driverToken -Body @{
  latitude = 12.3714
  longitude = -1.5197
} | Out-Null

Write-Step "Creating a real demo ride request from rider@orbi.app"
$rideRequest = Invoke-Json `
  -Method "POST" `
  -Path "/ride-requests" `
  -Token $riderToken `
  -ExtraHeaders @{
    "Idempotency-Key" = "local-demo-live-session-$RunId"
  } `
  -Body @{
    pickupAddress = "Universite Joseph Ki-Zerbo, Ouagadougou"
    pickupLatitude = 12.3783
    pickupLongitude = -1.4994
    destinationAddress = "Ouaga 2000"
    destinationLatitude = 12.3032
    destinationLongitude = -1.5241
    requestedVehicleType = "MOTORCYCLE"
    requestedServiceTier = "MOTO_STANDARD"
    estimatedDistanceKm = 6.2
    estimatedDurationMinutes = 18
    paymentMethod = "MOBILE_MONEY"
    pickupAreaType = "URBAN_CORE"
    city = "OUAGADOUGOU"
    districtProfile = "UNIVERSITY"
    notes = "Local demo live session $RunId"
  }

if (!$rideRequest.id) {
  Stop-DemoLiveSession "ride request response did not include an id"
}

Write-Step "Accepting the request as driver@orbi.app"
$accepted = Invoke-Json -Method "POST" -Path "/trips/accept/$($rideRequest.id)" -Token $driverToken
$tripId = $accepted.trip.id

if (!$tripId) {
  Stop-DemoLiveSession "accept response did not include trip id"
}

Invoke-Json -Method "PATCH" -Path "/trips/$tripId/status" -Token $driverToken -Body @{
  status = "DRIVER_ARRIVING"
} | Out-Null

$approachPositions = @(
  @{ latitude = 12.3714; longitude = -1.5197; accuracyMeters = 18; speedKph = 22 },
  @{ latitude = 12.3734; longitude = -1.5130; accuracyMeters = 16; speedKph = 21 },
  @{ latitude = 12.3754; longitude = -1.5070; accuracyMeters = 14; speedKph = 19 },
  @{ latitude = 12.3770; longitude = -1.5025; accuracyMeters = 12; speedKph = 18 },
  @{ latitude = 12.3778; longitude = -1.5004; accuracyMeters = 10; speedKph = 12 }
)

Write-Step "Posting real route positions so rider and driver maps move"
Record-Positions -TripId $tripId -DriverToken $driverToken -Positions $approachPositions -DistanceField "distanceToPickupKm"

$riderDetail = Invoke-Json -Method "GET" -Path "/trips/$tripId" -Token $riderToken
if ($riderDetail.trip.routeMonitoring.latestPosition.sourceRole -ne "DRIVER") {
  Stop-DemoLiveSession "rider trip detail does not expose latest driver position"
}

if ($StartTrip) {
  Write-Step "Starting the demo trip after driver arrival and moving toward destination"
  Invoke-Json -Method "PATCH" -Path "/trips/$tripId/status" -Token $driverToken -Body @{
    status = "IN_PROGRESS"
  } | Out-Null

  $destinationPositions = @(
    @{ latitude = 12.3600; longitude = -1.5075; accuracyMeters = 13; speedKph = 26 },
    @{ latitude = 12.3440; longitude = -1.5140; accuracyMeters = 13; speedKph = 27 },
    @{ latitude = 12.3290; longitude = -1.5200; accuracyMeters = 12; speedKph = 25 },
    @{ latitude = 12.3150; longitude = -1.5232; accuracyMeters = 11; speedKph = 20 },
    @{ latitude = 12.3045; longitude = -1.5240; accuracyMeters = 10; speedKph = 14 }
  )

  Record-Positions -TripId $tripId -DriverToken $driverToken -Positions $destinationPositions -DistanceField "distanceToDestinationKm"
}

$liveOps = Invoke-Json -Method "GET" -Path "/admin/live-ops" -Token $adminToken
if ($liveOps.summary.activeTrips -lt 1) {
  Stop-DemoLiveSession "admin live ops does not show an active trip"
}

Write-Host ""
Write-Host "Local demo live session is ready." -ForegroundColor Green
Write-Host "Trip:       $tripId"
Write-Host "Status:     $(if ($StartTrip) { 'IN_PROGRESS' } else { 'DRIVER_ARRIVING' })"
Write-Host ""
Write-Host "Open these apps and sign in with real seeded credentials:" -ForegroundColor White
Write-Host "  Admin:  http://localhost:3001        admin@orbi.app  / Orbi123!"
Write-Host "  Rider:  http://localhost:8081/auth   rider@orbi.app  / Orbi123!"
Write-Host "  Driver: http://localhost:8082/auth   driver@orbi.app / Orbi123!"
Write-Host ""
Write-Host "Run again while the apps are open to post fresh driver movement signals."
