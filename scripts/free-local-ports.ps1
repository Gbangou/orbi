param(
  [int[]]$Ports = @(3000, 3001, 8081, 8082, 8083)
)

$ErrorActionPreference = "Stop"
$currentPid = $PID
$seenProcessIds = @{}

Write-Host "Freeing Orbi local ports: $($Ports -join ', ')" -ForegroundColor Cyan

foreach ($port in $Ports) {
  $lines = netstat -ano -p tcp | Select-String -Pattern "LISTENING" | Where-Object {
    $_.Line -match "[:.]$port\s"
  }

  if (-not $lines) {
    Write-Host "[ok] Port $port is already free." -ForegroundColor Green
    continue
  }

  foreach ($line in $lines) {
    $parts = $line.Line.Trim() -split "\s+"
    $processId = [int]$parts[-1]

    if ($processId -eq 0 -or $processId -eq $currentPid) {
      Write-Host "[skip] Port $port is held by a protected process id $processId." -ForegroundColor Yellow
      continue
    }

    if ($seenProcessIds.ContainsKey($processId)) {
      continue
    }

    $seenProcessIds[$processId] = $true

    try {
      $process = Get-Process -Id $processId -ErrorAction Stop
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "[ok] Stopped $($process.ProcessName) ($processId) for port $port." -ForegroundColor Green
    } catch {
      Write-Host "[warn] Could not stop process $processId for port $port: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

Write-Host "Orbi local ports are ready." -ForegroundColor Green
