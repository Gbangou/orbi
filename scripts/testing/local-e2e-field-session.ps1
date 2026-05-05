param(
  [string]$ApiBaseUrl = "http://localhost:3000",
  [string]$AdminUrl = "http://localhost:3001",
  [string]$RiderMode = "web-or-expo",
  [string]$DriverMode = "web-or-expo"
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Test-HttpEndpoint {
  param(
    [string]$Name,
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 4
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      Write-Host "[ok] $Name reachable: $Url" -ForegroundColor Green
      return
    }

    Write-Host "[warn] $Name returned HTTP $($response.StatusCode): $Url" -ForegroundColor Yellow
  } catch {
    Write-Host "[todo] $Name not reachable yet: $Url" -ForegroundColor Yellow
  }
}

Write-Host "Mobilis local E2E field session checklist" -ForegroundColor White
Write-Host "API:   $ApiBaseUrl"
Write-Host "Admin: $AdminUrl"
Write-Host "Rider: $RiderMode"
Write-Host "Driver: $DriverMode"

Write-Section "Readiness"
Test-HttpEndpoint -Name "Backend health" -Url "$ApiBaseUrl/api/v1/health"
Test-HttpEndpoint -Name "Admin web" -Url $AdminUrl

Write-Host ""
Write-Host "Start stack when needed:" -ForegroundColor Gray
Write-Host "  pnpm db:start"
Write-Host "  pnpm prisma:generate"
Write-Host "  pnpm prisma:migrate"
Write-Host "  pnpm prisma:seed"
Write-Host "  pnpm dev:full-web"
Write-Host "  pnpm dev:web-driver-preview  # in a separate pass for driver web"
Write-Host "  pnpm mobile:lan && pnpm dev:full-mobile  # for phone validation"

Write-Section "Demo Accounts"
Write-Host "Admin:  admin@mobilis.app / Mobilis123!"
Write-Host "Rider:  rider@mobilis.app / Mobilis123!"
Write-Host "Driver: driver@mobilis.app / Mobilis123!"

Write-Section "Critical Path"
$items = @(
  "Rider signs in and creates a MOBILE_MONEY motorcycle ride request.",
  "Driver signs in, goes ONLINE, updates presence, receives or fetches the offer.",
  "Driver accepts the ride request; admin live ops shows the matched trip.",
  "Trip advances through DRIVER_ARRIVING, pickup code verification, IN_PROGRESS and COMPLETED.",
  "Rider creates a checkout intent; capture the transactionRef and amount.",
  "Post a local payment webhook with x-mobilis-webhook-secret=mobilis_dev_webhook_secret.",
  "Admin journal shows reconciled webhook, linked payment attempt and provider reference.",
  "Driver wallet shows CREDIT ledger entry, net payout and Mobilis commission.",
  "Admin prepares payout, exports CSV/PDF settlement, then marks payout paid.",
  "Admin refunds the payment attempt; journal switches to REFUNDED and refund button disables.",
  "Driver wallet shows REFUND reversal and balance decreases by original driver payout.",
  "Live ops payments show reconciled and refunded counters coherently."
)

for ($index = 0; $index -lt $items.Count; $index++) {
  Write-Host ("[ ] {0}. {1}" -f ($index + 1), $items[$index])
}

Write-Section "Webhook Shape"
Write-Host "Use the checkout transactionRef from the session. Example body:"
Write-Host @'
{
  "event": "payment.completed",
  "transactionRef": "<transactionRef>",
  "data": {
    "tx_ref": "<transactionRef>",
    "providerReference": "local_provider_ref_<unique>",
    "status": "successful",
    "amount": <amount>,
    "currency": "XOF"
  }
}
'@

Write-Section "Pass Criteria"
Write-Host "[ ] No critical button can be double-submitted into duplicate money state."
Write-Host "[ ] Every money mutation is visible in admin and audit-backed."
Write-Host "[ ] Rider, driver and admin all recover after refresh/reopen."
Write-Host "[ ] Errors are readable without looking at terminal logs."
Write-Host "[ ] docs/local-e2e-field-session.md is updated with every bug found."
