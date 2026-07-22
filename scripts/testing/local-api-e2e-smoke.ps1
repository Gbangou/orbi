param(
  [string]$ApiBaseUrl = "http://localhost:3000",
  [string]$WebhookSecret = "orbi_dev_webhook_secret"
)

$ErrorActionPreference = "Stop"
$ApiRoot = "$ApiBaseUrl/api/v1"
$RunId = Get-Date -Format "yyyyMMddHHmmss"

function Write-Step {
  param([string]$Message)
  Write-Host "[e2e] $Message" -ForegroundColor Cyan
}

function Stop-LocalApiE2E {
  param([string]$Message)
  throw "Local API E2E failed: $Message"
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

    Stop-LocalApiE2E "$Method $Path -> $message"
  }
}

function Request-SessionToken {
  param([string]$Email)

  $response = Invoke-Json -Method "POST" -Path "/auth/sign-in" -Body @{
    email = $Email
    password = "Orbi123!"
  }

  if (!$response.sessionToken) {
    Stop-LocalApiE2E "sign-in returned no session token for $Email"
  }

  return $response.sessionToken
}

function Request-E2ERiderSessionToken {
  param([string]$RunId)

  $email = "local-api-e2e-$RunId@orbi.test"
  $response = Invoke-Json -Method "POST" -Path "/auth/sign-up" -Body @{
    fullName = "Awa Test"
    email = $email
    password = "Orbi123!"
    role = "RIDER"
  }

  if (!$response.sessionToken) {
    Stop-LocalApiE2E "sign-up returned no session token for $email"
  }

  return $response.sessionToken
}

function Test-ExpectedValue {
  param(
    [object]$Actual,
    [object]$Expected,
    [string]$Message
  )

  if ($Actual -ne $Expected) {
    Stop-LocalApiE2E "$Message. Expected '$Expected', got '$Actual'."
  }
}

function Test-NumberLessThan {
  param(
    [double]$Actual,
    [double]$ExpectedUpperBound,
    [string]$Message
  )

  if ($Actual -ge $ExpectedUpperBound) {
    Stop-LocalApiE2E "$Message. Expected less than '$ExpectedUpperBound', got '$Actual'."
  }
}

function Clear-DriverActiveTrips {
  param([string]$DriverToken)

  $driverTrips = Invoke-Json -Method "GET" -Path "/trips/mine" -Token $DriverToken
  $activeTrips = @($driverTrips.recentTrips | Where-Object {
      @("MATCHED", "DRIVER_ARRIVING", "IN_PROGRESS") -contains $_.status
    })

  foreach ($trip in $activeTrips) {
    Write-Step "Cancelling leftover active trip $($trip.id)"
    Invoke-Json -Method "PATCH" -Path "/trips/$($trip.id)/status" -Token $DriverToken -Body @{
      status = "CANCELLED"
    } | Out-Null
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

Write-Step "Signing in demo accounts"
$adminToken = Request-SessionToken -Email "admin@orbi.app"
$riderToken = Request-E2ERiderSessionToken -RunId $RunId
$driverToken = Request-SessionToken -Email "driver@orbi.app"
Clear-DriverActiveTrips -DriverToken $driverToken

Write-Step "Putting driver online and updating presence"
Invoke-Json -Method "PATCH" -Path "/drivers/availability" -Token $driverToken -Body @{
  status = "ONLINE"
} | Out-Null
Invoke-Json -Method "PATCH" -Path "/drivers/presence" -Token $driverToken -Body @{
  latitude = 12.3714
  longitude = -1.5197
} | Out-Null

Write-Step "Creating rider request"
$rideRequest = Invoke-Json `
  -Method "POST" `
  -Path "/ride-requests" `
  -Token $riderToken `
  -ExtraHeaders @{
    "Idempotency-Key" = "local-api-e2e-ride-request-$RunId"
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
  notes = "Local API E2E $RunId"
}

if (!$rideRequest.id) {
  Stop-LocalApiE2E "ride request response did not include id"
}

Write-Step "Accepting ride request as driver"
$accepted = Invoke-Json -Method "POST" -Path "/trips/accept/$($rideRequest.id)" -Token $driverToken
$tripId = $accepted.trip.id

if (!$tripId) {
  Stop-LocalApiE2E "accept response did not include trip id"
}

Test-ExpectedValue -Actual $accepted.trip.status -Expected "MATCHED" -Message "trip should be matched after accept"

Write-Step "Advancing trip lifecycle"
$arriving = Invoke-Json -Method "PATCH" -Path "/trips/$tripId/status" -Token $driverToken -Body @{
  status = "DRIVER_ARRIVING"
}
Test-ExpectedValue -Actual $arriving.trip.status -Expected "DRIVER_ARRIVING" -Message "trip should move to arriving"

Write-Step "Recording live approach positions"
$approachFarSignal = Invoke-Json -Method "POST" -Path "/trips/$tripId/route-position" -Token $driverToken -Body @{
  latitude = 12.3714
  longitude = -1.5197
  accuracyMeters = 18
  speedKph = 22
}

$approachFarDetail = Invoke-Json -Method "GET" -Path "/trips/$tripId" -Token $riderToken

$approachNearSignal = Invoke-Json -Method "POST" -Path "/trips/$tripId/route-position" -Token $driverToken -Body @{
  latitude = 12.3776
  longitude = -1.5010
  accuracyMeters = 12
  speedKph = 18
}

$approachNearDetail = Invoke-Json -Method "GET" -Path "/trips/$tripId" -Token $riderToken

if ($null -eq $approachFarSignal.routeMonitoring.latestPosition.distanceToPickupKm) {
  Stop-LocalApiE2E "route position response did not expose first distance to pickup"
}

if ($null -eq $approachNearSignal.routeMonitoring.latestPosition.distanceToPickupKm) {
  Stop-LocalApiE2E "route position response did not expose updated distance to pickup"
}

Test-NumberLessThan `
  -Actual ([double]$approachNearSignal.routeMonitoring.latestPosition.distanceToPickupKm) `
  -ExpectedUpperBound ([double]$approachFarSignal.routeMonitoring.latestPosition.distanceToPickupKm) `
  -Message "route position response should show driver moving closer to pickup"

if ($null -eq $approachFarDetail.trip.routeMonitoring.latestPosition.distanceToPickupKm) {
  Stop-LocalApiE2E "first route position did not expose distance to pickup"
}

if ($null -eq $approachNearDetail.trip.routeMonitoring.latestPosition.distanceToPickupKm) {
  Stop-LocalApiE2E "route position did not expose distance to pickup"
}

Test-NumberLessThan `
  -Actual ([double]$approachNearDetail.trip.routeMonitoring.latestPosition.distanceToPickupKm) `
  -ExpectedUpperBound ([double]$approachFarDetail.trip.routeMonitoring.latestPosition.distanceToPickupKm) `
  -Message "driver should move closer to pickup"

Test-ExpectedValue -Actual $approachNearDetail.trip.routeMonitoring.latestPosition.sourceRole -Expected "DRIVER" -Message "rider trip detail should expose latest driver position"
Test-ExpectedValue -Actual $approachNearSignal.routeMonitoring.latestPosition.sourceRole -Expected "DRIVER" -Message "route position response should expose latest driver position"
Test-NumberLessThan `
  -Actual ([double]$approachNearDetail.trip.routeMonitoring.latestPosition.distanceToPickupKm) `
  -ExpectedUpperBound 0.3 `
  -Message "rider should see the driver close to pickup"

$started = Invoke-Json -Method "PATCH" -Path "/trips/$tripId/status" -Token $driverToken -Body @{
  status = "IN_PROGRESS"
}
Test-ExpectedValue -Actual $started.trip.status -Expected "IN_PROGRESS" -Message "driver should start trip after arriving"

Write-Step "Recording in-progress destination movement"
$destinationSignal = Invoke-Json -Method "POST" -Path "/trips/$tripId/route-position" -Token $driverToken -Body @{
  latitude = 12.3400
  longitude = -1.5150
  accuracyMeters = 15
  speedKph = 28
}

$driverTripDetail = Invoke-Json -Method "GET" -Path "/trips/$tripId" -Token $driverToken
if ($null -eq $destinationSignal.routeMonitoring.latestPosition.distanceToDestinationKm) {
  Stop-LocalApiE2E "route position response did not expose distance to destination"
}

if ($null -eq $driverTripDetail.trip.routeMonitoring.latestPosition.distanceToDestinationKm) {
  Stop-LocalApiE2E "in-progress route position did not expose distance to destination"
}

Test-ExpectedValue -Actual $driverTripDetail.trip.routeMonitoring.latestPosition.sourceRole -Expected "DRIVER" -Message "driver trip detail should expose latest driver route signal"
Test-ExpectedValue -Actual $destinationSignal.routeMonitoring.latestPosition.sourceRole -Expected "DRIVER" -Message "destination route position response should expose latest driver route signal"
Test-NumberLessThan `
  -Actual ([double]$driverTripDetail.trip.routeMonitoring.latestPosition.distanceToDestinationKm) `
  -ExpectedUpperBound 5 `
  -Message "driver should see remaining destination distance"
Test-NumberLessThan `
  -Actual ([double]$destinationSignal.routeMonitoring.latestPosition.distanceToDestinationKm) `
  -ExpectedUpperBound 5 `
  -Message "route position response should show remaining destination distance"

$completed = Invoke-Json -Method "PATCH" -Path "/trips/$tripId/status" -Token $driverToken -Body @{
  status = "COMPLETED"
}
Test-ExpectedValue -Actual $completed.trip.status -Expected "COMPLETED" -Message "trip should complete"

Write-Step "Creating checkout intent"
$checkout = Invoke-Json -Method "POST" -Path "/payments/checkout-intents" -Token $riderToken -Body @{
  rideRequestId = $rideRequest.id
  channel = "MOBILE_MONEY"
  mobileMoneyNetwork = "ORANGE_MONEY"
  customerPhoneNumber = "+22670000000"
}

if (!$checkout.transactionRef -or !$checkout.amount) {
  Stop-LocalApiE2E "checkout response did not include transactionRef and amount"
}

Write-Step "Posting local success webhook"
$providerReference = "local_provider_ref_$RunId"
$webhook = Invoke-Json -Method "POST" -Path "/payments/webhooks" -ExtraHeaders @{
  "x-orbi-webhook-secret" = $WebhookSecret
} -Body @{
  event = "payment.completed"
  transactionRef = $checkout.transactionRef
  data = @{
    tx_ref = $checkout.transactionRef
    providerReference = $providerReference
    status = "successful"
    amount = $checkout.amount
    currency = $checkout.currency
  }
}

Test-ExpectedValue -Actual $webhook.nextAction -Expected "persisted_and_reconciled" -Message "webhook should reconcile"

Write-Step "Loading webhook journal"
$journal = Invoke-Json -Method "GET" -Path "/admin/payment-webhook-events?page=1&pageSize=10&transactionRef=$($checkout.transactionRef)" -Token $adminToken
$webhookEvent = $journal.events | Select-Object -First 1

if (!$webhookEvent -or !$webhookEvent.paymentAttemptId) {
  Stop-LocalApiE2E "webhook journal did not expose linked payment attempt"
}

Test-ExpectedValue -Actual $webhookEvent.paymentAttempt.status -Expected "SUCCEEDED" -Message "payment attempt should be succeeded"

Write-Step "Checking wallet credit"
$wallets = Invoke-Json -Method "GET" -Path "/admin/driver-wallets?page=1&pageSize=20" -Token $adminToken
$wallet = $wallets.wallets | Where-Object {
  $_.recentTransactions | Where-Object { $_.paymentAttemptId -eq $webhookEvent.paymentAttemptId -and $_.type -eq "CREDIT" }
} | Select-Object -First 1

if (!$wallet) {
  Stop-LocalApiE2E "driver wallet credit was not visible in admin wallets"
}

Write-Step "Preparing and marking payout paid"
$prepared = Invoke-Json -Method "POST" -Path "/admin/driver-wallets/$($wallet.id)/payouts/prepare" -Token $adminToken -Body @{
  notes = "Local API E2E payout $RunId"
}

if (!$prepared.payout.id) {
  Stop-LocalApiE2E "payout preparation returned no payout id"
}

$paid = Invoke-Json -Method "POST" -Path "/admin/driver-payouts/$($prepared.payout.id)/paid" -Token $adminToken -Body @{
  notes = "Local API E2E payout paid $RunId"
}

if (@("paid", "already_paid", "already_finalized") -notcontains $paid.action) {
  Stop-LocalApiE2E "unexpected payout paid action '$($paid.action)'"
}

Write-Step "Refunding payment attempt"
$refund = Invoke-Json -Method "POST" -Path "/admin/payment-attempts/$($webhookEvent.paymentAttemptId)/refund" -Token $adminToken -Body @{
  reason = "Local API E2E refund $RunId"
}

Test-ExpectedValue -Actual $refund.refund.paymentAttempt.status -Expected "REFUNDED" -Message "payment attempt should be refunded"

Write-Step "Checking refund reversal in wallet"
$walletsAfterRefund = Invoke-Json -Method "GET" -Path "/admin/driver-wallets?page=1&pageSize=20" -Token $adminToken
$refundReference = "payment:$($webhookEvent.paymentAttemptId):driver-payout-refund"
$refundTransaction = $walletsAfterRefund.wallets.recentTransactions | ForEach-Object { $_ } | Where-Object {
  $_.reference -eq $refundReference -and $_.type -eq "REFUND"
} | Select-Object -First 1

if (!$refundTransaction) {
  Stop-LocalApiE2E "refund wallet reversal was not visible in admin wallets"
}

Write-Step "Recording recovery adjustment"
$recoveryWallet = $walletsAfterRefund.wallets | Where-Object { $_.id -eq $wallet.id } | Select-Object -First 1
if (!$recoveryWallet -or $recoveryWallet.recoveryDue -le 0) {
  Stop-LocalApiE2E "wallet did not expose recovery due after refund"
}

$recovery = Invoke-Json -Method "POST" -Path "/admin/driver-wallets/$($wallet.id)/recovery-adjustments" -Token $adminToken -Body @{
  amount = $recoveryWallet.recoveryDue
  notes = "Local API E2E recovery adjustment $RunId"
  idempotencyKey = "local-api-e2e-$RunId"
}

Test-ExpectedValue -Actual $recovery.wallet.recoveryDue -Expected 0 -Message "recovery adjustment should clear recovery due"

Write-Step "Checking live ops refund counter"
$liveOps = Invoke-Json -Method "GET" -Path "/admin/live-ops" -Token $adminToken
if ($liveOps.summary.payments.refunded -lt 1) {
  Stop-LocalApiE2E "live ops refunded counter did not include the refund"
}

Write-Host ""
Write-Host "Local API E2E smoke passed." -ForegroundColor Green
Write-Host "RideRequest:     $($rideRequest.id)"
Write-Host "Trip:            $tripId"
Write-Host "PaymentAttempt:  $($webhookEvent.paymentAttemptId)"
Write-Host "TransactionRef:  $($checkout.transactionRef)"
Write-Host "ProviderRef:     $providerReference"
Write-Host "Wallet:          $($wallet.id)"
Write-Host "RefundReference: $refundReference"
Write-Host "RecoveryTx:      $($recovery.transaction.reference)"
