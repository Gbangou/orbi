param(
  [string]$HostIp
)

$ErrorActionPreference = 'Stop'

function Resolve-LanIp {
  try {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -ne 'WellKnown' -and
        $_.InterfaceOperationalStatus -eq 'Up'
      } |
      Sort-Object -Property InterfaceMetric, InterfaceIndex

    if ($addresses) {
      return $addresses[0].IPAddress
    }
  }
  catch {
    Write-Host 'Get-NetIPAddress was not available; falling back to ipconfig.'
  }

  $ipconfig = ipconfig
  $blocks = ($ipconfig -join "`n") -split "(`r?`n){2,}"
  foreach ($block in $blocks) {
    $ipMatch = [regex]::Match($block, 'IPv4.*?:\s*(\d+\.\d+\.\d+\.\d+)')
    $gatewayMatch = [regex]::Match($block, 'Passerelle.*?:\s*(\d+\.\d+\.\d+\.\d+)')

    if ($ipMatch.Success -and $gatewayMatch.Success) {
      $ip = $ipMatch.Groups[1].Value
      if (
        $ip -notlike '127.*' -and
        $ip -notlike '169.254.*' -and
        $ip -notlike '172.17.*' -and
        $ip -notlike '172.28.*'
      ) {
        return $ip
      }
    }
  }

  $matches = $ipconfig | Select-String -Pattern 'IPv4.*?:\s*(\d+\.\d+\.\d+\.\d+)'
  $candidate = $matches |
    ForEach-Object { $_.Matches[0].Groups[1].Value } |
    Where-Object {
      $_ -notlike '127.*' -and
      $_ -notlike '169.254.*' -and
      $_ -notlike '172.17.*' -and
      $_ -notlike '172.28.*'
    } |
    Select-Object -First 1

  if ($candidate) {
    return $candidate
  }

  throw 'Unable to find an active LAN IPv4 address. Pass one explicitly: pnpm mobile:lan -- -HostIp 192.168.1.20'
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $line = "$Key=$Value"

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType File -Path $Path -Force | Out-Null
    Set-Content -LiteralPath $Path -Value $line
    return
  }

  $content = Get-Content -LiteralPath $Path
  $updated = $false
  $next = foreach ($entry in $content) {
    if ($entry -match "^$([regex]::Escape($Key))=") {
      $updated = $true
      $line
    }
    else {
      $entry
    }
  }

  if (-not $updated) {
    $next = @($next) + $line
  }

  Set-Content -LiteralPath $Path -Value $next
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$ip = if ($HostIp) { $HostIp } else { Resolve-LanIp }
$apiBaseUrl = "http://${ip}:3000"

$mobileEnvFiles = @(
  Join-Path $repoRoot 'apps\rider-app\.env'
  Join-Path $repoRoot 'apps\driver-app\.env'
)

foreach ($envFile in $mobileEnvFiles) {
  Set-EnvValue -Path $envFile -Key 'EXPO_PUBLIC_API_BASE_URL' -Value $apiBaseUrl
  Set-EnvValue -Path $envFile -Key 'EXPO_PUBLIC_API_VERSION' -Value 'v1'
}

Write-Host ''
Write-Host "Mobile API URL set to $apiBaseUrl"
Write-Host 'Updated:'
foreach ($envFile in $mobileEnvFiles) {
  Write-Host "- $envFile"
}
Write-Host ''
Write-Host 'Next:'
Write-Host '1. Keep the phone and PC on the same Wi-Fi.'
Write-Host '2. Allow Node.js through Windows Firewall if prompted.'
Write-Host '3. Run pnpm dev:backend in one terminal.'
Write-Host '4. Run pnpm dev:rider or pnpm dev:driver in another terminal.'
Write-Host '5. Scan the Expo QR code with Expo Go.'
