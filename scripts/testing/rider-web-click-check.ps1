param(
  [string]$BaseUrl = 'http://localhost:8081',
  [string]$DebugUrl = 'http://localhost:9222'
)

$ErrorActionPreference = 'Stop'
$script:nextCdpId = 0

function Send-CdpJson {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [hashtable]$Payload
  )

  $json = $Payload | ConvertTo-Json -Depth 20 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $segment = [ArraySegment[byte]]::new($bytes)
  $Socket.SendAsync(
    $segment,
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [System.Threading.CancellationToken]::None
  ).GetAwaiter().GetResult() | Out-Null
}

function Receive-CdpJson {
  param([System.Net.WebSockets.ClientWebSocket]$Socket)

  $buffer = New-Object byte[] 1048576
  $builder = [System.Text.StringBuilder]::new()

  do {
    $segment = [ArraySegment[byte]]::new($buffer)
    $result = $Socket.ReceiveAsync(
      $segment,
      [System.Threading.CancellationToken]::None
    ).GetAwaiter().GetResult()

    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
      throw 'Chrome DevTools websocket closed before the check completed.'
    }

    [void]$builder.Append(
      [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
    )
  } while (-not $result.EndOfMessage)

  return $builder.ToString() | ConvertFrom-Json
}

function Invoke-Cdp {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Method,
    [hashtable]$Params = @{}
  )

  $script:nextCdpId += 1
  $id = $script:nextCdpId
  Send-CdpJson -Socket $Socket -Payload @{
    id = $id
    method = $Method
    params = $Params
  }

  while ($true) {
    $message = Receive-CdpJson -Socket $Socket

    if ($message.id -eq $id) {
      if ($message.error) {
        throw "$Method failed: $($message.error.message)"
      }

      return $message.result
    }
  }
}

function Wait-CdpEvent {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Method,
    [int]$TimeoutMs = 10000
  )

  $deadline = [DateTimeOffset]::Now.AddMilliseconds($TimeoutMs)

  while ([DateTimeOffset]::Now -lt $deadline) {
    $message = Receive-CdpJson -Socket $Socket

    if ($message.method -eq $Method) {
      return $message
    }
  }

  throw "Timed out waiting for $Method."
}

function Invoke-JavaScript {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Expression
  )

  $result = Invoke-Cdp -Socket $Socket -Method 'Runtime.evaluate' -Params @{
    expression = $Expression
    returnByValue = $true
    awaitPromise = $true
  }

  if ($result.exceptionDetails) {
    throw "JavaScript evaluation failed: $($result.exceptionDetails.text)"
  }

  return $result.result.value
}

function Assert-PageHealthy {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$ExpectedText
  )

  $state = Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
  const text = document.body?.innerText || '';
  return {
    url: location.href,
    hasOverlay: text.includes('Uncaught Error') || text.includes('Component is not a function'),
    hasExpectedText: text.includes('$ExpectedText'),
    text: text.slice(0, 1000)
  };
})()
"@

  if ($state.hasOverlay) {
    throw "Expo error overlay found on $($state.url)."
  }

  if (-not $state.hasExpectedText) {
    throw "Expected '$ExpectedText' on $($state.url), saw: $($state.text)"
  }
}

function Click-Text {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Label
  )

  $escapedLabel = $Label.Replace('\', '\\').Replace("'", "\'")
  $result = Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
  const matches = Array.from(document.querySelectorAll('button, [role="button"], a, input, textarea, div'))
    .map((element) => {
      const text = (element.innerText || element.value || '').trim();
      return { element, text };
    })
    .filter((item) => item.text.includes('$escapedLabel'))
    .sort((left, right) => left.text.length - right.text.length);
  const element = matches[0]?.element;
  if (!element) {
    return { ok: false, text: document.body?.innerText?.slice(0, 1000) || '' };
  }
  element.scrollIntoView({ block: 'center', inline: 'center' });
  element.click();
  return { ok: true, label: (element.innerText || element.value || '').trim() };
})()
"@

  if (-not $result.ok) {
    throw "Could not click '$Label'. Page text: $($result.text)"
  }
}

$targets = Invoke-RestMethod "$DebugUrl/json/list"
if (-not $targets -or -not $targets[0].webSocketDebuggerUrl) {
  throw "No Chrome DevTools target found at $DebugUrl."
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$socket.ConnectAsync(
  [Uri]$targets[0].webSocketDebuggerUrl,
  [System.Threading.CancellationToken]::None
).GetAwaiter().GetResult() | Out-Null

try {
  Invoke-Cdp -Socket $socket -Method 'Page.enable' | Out-Null
  Invoke-Cdp -Socket $socket -Method 'Runtime.enable' | Out-Null
  Invoke-Cdp -Socket $socket -Method 'Page.navigate' -Params @{ url = "$BaseUrl/auth" } | Out-Null
  Wait-CdpEvent -Socket $socket -Method 'Page.loadEventFired' | Out-Null
  Start-Sleep -Milliseconds 800
  Invoke-JavaScript -Socket $socket -Expression "localStorage.removeItem('mobilis.rider.session-token'); true" | Out-Null
  Assert-PageHealthy -Socket $socket -ExpectedText 'Connexion et compte'

  Click-Text -Socket $socket -Label 'Inscription'
  Start-Sleep -Milliseconds 300
  Assert-PageHealthy -Socket $socket -ExpectedText 'Creer un compte passager'

  Click-Text -Socket $socket -Label 'Connexion'
  Start-Sleep -Milliseconds 300
  Assert-PageHealthy -Socket $socket -ExpectedText 'Reprendre votre session'

  Invoke-Cdp -Socket $socket -Method 'Page.navigate' -Params @{ url = "$BaseUrl/" } | Out-Null
  Wait-CdpEvent -Socket $socket -Method 'Page.loadEventFired' | Out-Null
  Start-Sleep -Milliseconds 1000
  Assert-PageHealthy -Socket $socket -ExpectedText 'Connexion et compte'

  Write-Host "Rider web click check passed for $BaseUrl"
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $socket.CloseAsync(
      [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
      'done',
      [System.Threading.CancellationToken]::None
    ).GetAwaiter().GetResult() | Out-Null
  }

  $socket.Dispose()
}
