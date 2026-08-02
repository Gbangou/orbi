param(
  [string]$DebugUrl = 'http://localhost:9222',
  [string]$OutputDir = 'artifacts/mobile-visual-qa',
  [string]$RiderBaseUrl = 'http://localhost:8081',
  [string]$DriverBaseUrl = 'http://localhost:8082',
  [string]$ApiBaseUrl = '',
  [string]$ApiVersion = 'v1',
  [string]$RiderDemoEmail = '',
  [string]$RiderDemoPassword = '',
  [string]$DriverDemoEmail = '',
  [string]$DriverDemoPassword = '',
  [string]$RiderSessionToken = '',
  [string]$DriverSessionToken = '',
  [string[]]$TargetSlugs = @(),
  [switch]$AuthenticateDemoSessions,
  [switch]$AuthOnly
)

$ErrorActionPreference = 'Stop'
$script:nextCdpId = 0

if ($AuthenticateDemoSessions -and ($RiderSessionToken -or $DriverSessionToken)) {
  if (-not $RiderSessionToken) {
    throw 'RiderSessionToken is required when injecting authenticated rider captures.'
  }
  if (-not $DriverSessionToken) {
    throw 'DriverSessionToken is required when injecting authenticated driver captures.'
  }
}

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
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [int]$TimeoutMs = 30000
  )

  $buffer = New-Object byte[] 1048576
  $builder = [System.Text.StringBuilder]::new()
  $cts = [System.Threading.CancellationTokenSource]::new()
  $cts.CancelAfter($TimeoutMs)

  try {
    do {
      $segment = [ArraySegment[byte]]::new($buffer)
      $result = $Socket.ReceiveAsync(
        $segment,
        $cts.Token
      ).GetAwaiter().GetResult()

      if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
        throw 'Chrome DevTools websocket closed before capture completed.'
      }

      [void]$builder.Append(
        [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
      )
    } while (-not $result.EndOfMessage)
  } catch [System.OperationCanceledException] {
    throw "Timed out waiting for Chrome DevTools message after $TimeoutMs ms."
  } finally {
    $cts.Dispose()
  }

  return $builder.ToString() | ConvertFrom-Json
}

function Invoke-Cdp {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Method,
    [hashtable]$Params = @{},
    [int]$TimeoutMs = 30000
  )

  $script:nextCdpId += 1
  $id = $script:nextCdpId
  $deadline = [DateTimeOffset]::Now.AddMilliseconds($TimeoutMs)
  Send-CdpJson -Socket $Socket -Payload @{
    id = $id
    method = $Method
    params = $Params
  }

  while ($true) {
    $remainingMs = [int]([Math]::Max(1, ($deadline - [DateTimeOffset]::Now).TotalMilliseconds))
    if ($remainingMs -le 1) {
      throw "Timed out waiting for $Method response after $TimeoutMs ms."
    }

    $message = Receive-CdpJson -Socket $Socket -TimeoutMs $remainingMs

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
    [int]$TimeoutMs = 30000
  )

  $deadline = [DateTimeOffset]::Now.AddMilliseconds($TimeoutMs)

  while ([DateTimeOffset]::Now -lt $deadline) {
    $remainingMs = [int]([Math]::Max(1, ($deadline - [DateTimeOffset]::Now).TotalMilliseconds))
    $message = Receive-CdpJson -Socket $Socket -TimeoutMs $remainingMs

    if ($message.method -eq $Method) {
      return $message
    }
  }

  throw "Timed out waiting for $Method."
}

function Invoke-JavaScript {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Expression,
    [int]$TimeoutMs = 45000
  )

  $result = Invoke-Cdp -Socket $Socket -Method 'Runtime.evaluate' -Params @{
    expression = $Expression
    returnByValue = $true
    awaitPromise = $true
  } -TimeoutMs $TimeoutMs

  if ($result.exceptionDetails) {
    $description = $result.exceptionDetails.exception.description
    if (-not $description) {
      $description = $result.exceptionDetails.text
    }
    throw "JavaScript evaluation failed: $description"
  }

  return $result.result.value
}

function Invoke-DemoSignIn {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Url,
    [string]$ApiBaseUrl,
    [string]$Email,
    [string]$Password,
    [string]$StorageKey,
    [string]$ButtonText
  )

  Invoke-Cdp -Socket $Socket -Method 'Page.navigate' -Params @{ url = $Url } | Out-Null
  $storageReady = Invoke-JavaScript -Socket $Socket -Expression @"
(async () => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      if (location.href.startsWith('$Url')) {
        sessionStorage.length;
        return true;
      }
    } catch (error) {
      // Navigation can briefly sit on an opaque about:blank document.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
})()
"@

  if (-not $storageReady) {
    Invoke-Cdp -Socket $Socket -Method 'Page.reload' -Params @{ ignoreCache = $true } | Out-Null
    Start-Sleep -Milliseconds 2500
  }

  return Invoke-JavaScript -Socket $Socket -TimeoutMs 120000 -Expression @"
(async () => {
  const apiBaseUrl = '$ApiBaseUrl';
  const email = '$Email';
  const password = '$Password';
  const storageKey = '$StorageKey';
  const buttonText = '$ButtonText';
  try {
    sessionStorage.removeItem(storageKey);
  } catch (error) {
    return {
      ok: false,
      reason: 'session_storage_unavailable',
      url: location.href,
      origin: location.origin,
      error: error instanceof Error ? error.message : String(error),
      textSample: (document.body?.innerText || '').trim().slice(0, 500)
    };
  }

  let healthProbe = { ok: false, status: 0, error: 'not_run' };
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  if (apiBaseUrl) {
    try {
      const response = await fetchWithTimeout(apiBaseUrl + '/api/v1/health', {}, 8000);
      healthProbe = { ok: response.ok, status: response.status, error: '' };
    } catch (error) {
      healthProbe = {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  let directSignIn = { ok: false, status: 0, error: 'not_run' };
  if (apiBaseUrl && email && password) {
    try {
      const response = await fetchWithTimeout(apiBaseUrl + '/api/v1/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }, 12000);
      const payload = await response.json().catch(() => ({}));
      directSignIn = {
        ok: response.ok && Boolean(payload.sessionToken),
        status: response.status,
        error: response.ok ? '' : JSON.stringify(payload).slice(0, 300)
      };

      if (payload.sessionToken) {
        try {
          sessionStorage.setItem(storageKey, payload.sessionToken);
        } catch (error) {
          return {
            ok: false,
            reason: 'session_storage_write_failed',
            healthProbe,
            directSignIn,
            url: location.href,
            origin: location.origin,
            error: error instanceof Error ? error.message : String(error)
          };
        }
        return {
          ok: true,
          reason: 'api_signed_in',
          healthProbe,
          directSignIn,
          url: location.href,
          tokenLength: payload.sessionToken.length
        };
      }
    } catch (error) {
      directSignIn = {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const findButton = () => Array.from(document.querySelectorAll('[role="button"], button'))
    .filter((element) => (element.innerText || element.getAttribute('aria-label') || '').trim().includes(buttonText))
    .sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return (aRect.width * aRect.height) - (bRect.width * bRect.height);
    })[0] || null;

  const renderDeadline = Date.now() + 60000;
  let button = findButton();
  while (!button && Date.now() < renderDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    button = findButton();
  }

  if (!button) {
    return {
      ok: false,
      reason: 'demo_button_not_found',
      healthProbe,
      directSignIn,
      url: location.href,
      textSample: (document.body?.innerText || '').trim().slice(0, 500)
    };
  }

  const rect = button.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    buttons: 1
  };

  if (typeof PointerEvent !== 'undefined') {
    button.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    button.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, buttons: 0 }));
  }
  button.dispatchEvent(new MouseEvent('mousedown', eventInit));
  button.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));
  button.dispatchEvent(new MouseEvent('click', { ...eventInit, buttons: 0 }));

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const token = sessionStorage.getItem(storageKey);
    if (token) {
      return {
        ok: true,
        reason: 'signed_in',
        healthProbe,
        directSignIn,
        url: location.href,
        tokenLength: token.length
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return {
    ok: false,
    reason: 'session_token_timeout',
    healthProbe,
    directSignIn,
    url: location.href,
    textSample: (document.body?.innerText || '').trim().slice(0, 700)
  };
})()
"@
}

function Set-DemoSessionToken {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [string]$Url,
    [string]$StorageKey,
    [string]$Token
  )

  Invoke-Cdp -Socket $Socket -Method 'Page.navigate' -Params @{ url = $Url } | Out-Null
  $storageReady = Invoke-JavaScript -Socket $Socket -TimeoutMs 30000 -Expression @"
(async () => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      if (location.href.startsWith('$Url')) {
        sessionStorage.length;
        return true;
      }
    } catch (error) {
      // Navigation can briefly sit on an opaque about:blank document.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
})()
"@

  if (-not $storageReady) {
    return [pscustomobject]@{
      ok = $false
      reason = 'session_storage_unavailable'
      url = $Url
    }
  }

  return Invoke-JavaScript -Socket $Socket -TimeoutMs 30000 -Expression @"
(() => {
  try {
    sessionStorage.setItem('$StorageKey', '$Token');
    return {
      ok: sessionStorage.getItem('$StorageKey') === '$Token',
      reason: 'token_injected',
      url: location.href,
      tokenLength: '$Token'.length
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'session_storage_write_failed',
      url: location.href,
      error: error instanceof Error ? error.message : String(error)
    };
  }
})()
"@
}

function Get-MobileVisualState {
  param([System.Net.WebSockets.ClientWebSocket]$Socket)

  return Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
  const docEl = document.documentElement;
  const body = document.body;
  const text = body?.innerText || '';
  const overflow = Array.from(document.querySelectorAll('*'))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const label = (element.innerText || element.getAttribute('aria-label') || '').trim();
      if (!label) return false;
      return rect.width > 0 && rect.height > 0 && (
        rect.right > window.innerWidth + 1 ||
        rect.left < -1 ||
        element.scrollWidth > element.clientWidth + 1
      );
    })
    .slice(0, 12)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 120),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth
      };
    });
  return {
    url: location.href,
    title: document.title,
    textSample: text.trim().slice(0, 700),
    hasExpoOverlay: text.includes('Uncaught Error') || text.includes('Failed to compile') || text.includes('Metro error'),
    isBlank: !body || text.trim().length < 20,
    bodyScrollWidth: docEl?.scrollWidth || body?.scrollWidth || 0,
    viewportWidth: window.innerWidth,
    rootHtmlLength: document.getElementById('root')?.innerHTML?.length || 0,
    scripts: Array.from(document.scripts).map((script) => script.src || script.textContent.slice(0, 80)),
    runtimeErrors: Array.isArray(globalThis.__orbiVisualQaErrors) ? globalThis.__orbiVisualQaErrors.slice(-8) : [],
    overflow
  };
})()
"@
}

function Wait-MobileVisualState {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [int]$TimeoutMs = 55000
  )

  $deadline = [DateTimeOffset]::Now.AddMilliseconds($TimeoutMs)
  $attempt = 0
  $lastState = $null

  while ([DateTimeOffset]::Now -lt $deadline) {
    Start-Sleep -Milliseconds 1000
    $attempt += 1
    $lastState = Get-MobileVisualState -Socket $Socket

    if (-not $lastState.isBlank -and $lastState.rootHtmlLength -gt 0) {
      return $lastState
    }

    if ($attempt -eq 10 -or $attempt -eq 25) {
      Invoke-Cdp -Socket $Socket -Method 'Page.reload' -Params @{
        ignoreCache = $true
      } | Out-Null
    }
  }

  return $lastState
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if ($AuthenticateDemoSessions) {
  $targets = @(
    @{ app = 'rider'; slug = 'rider-home'; url = "$RiderBaseUrl/home"; expectedPath = '/home' },
    @{ app = 'rider'; slug = 'rider-book'; url = "$RiderBaseUrl/book"; expectedPath = '/book' },
    @{ app = 'rider'; slug = 'rider-activity'; url = "$RiderBaseUrl/activity"; expectedPath = '/activity' },
    @{ app = 'rider'; slug = 'rider-trips'; url = "$RiderBaseUrl/trips"; expectedPath = '/trips' },
    @{ app = 'rider'; slug = 'rider-account'; url = "$RiderBaseUrl/account"; expectedPath = '/account' },
    @{ app = 'rider'; slug = 'rider-receipt'; url = "$RiderBaseUrl/receipt?tripId=visual-qa-trip"; expectedPath = '/receipt' },
    @{ app = 'rider'; slug = 'rider-rating'; url = "$RiderBaseUrl/rating?tripId=visual-qa-trip&driverName=Issa%20Kabore&fare=2500&destination=Ouaga%202000"; expectedPath = '/rating' },
    @{ app = 'driver'; slug = 'driver-onboarding'; url = "$DriverBaseUrl/onboarding"; expectedPath = '/onboarding' },
    @{ app = 'driver'; slug = 'driver-home'; url = "$DriverBaseUrl/accueil"; expectedPath = '/accueil' },
    @{ app = 'driver'; slug = 'driver-offers'; url = "$DriverBaseUrl/offres"; expectedPath = '/offres' },
    @{ app = 'driver'; slug = 'driver-earnings'; url = "$DriverBaseUrl/revenus"; expectedPath = '/revenus' },
    @{ app = 'driver'; slug = 'driver-profile'; url = "$DriverBaseUrl/profil"; expectedPath = '/profil' }
  )
} else {
  $targets = @(
    @{ app = 'rider'; slug = 'rider-auth'; url = "$RiderBaseUrl/auth"; expectedPath = '/auth' },
    @{ app = 'rider'; slug = 'rider-home'; url = "$RiderBaseUrl/home"; expectedPath = '/home' },
    @{ app = 'rider'; slug = 'rider-book'; url = "$RiderBaseUrl/book"; expectedPath = '/book' },
    @{ app = 'rider'; slug = 'rider-activity'; url = "$RiderBaseUrl/activity"; expectedPath = '/activity' },
    @{ app = 'rider'; slug = 'rider-trips'; url = "$RiderBaseUrl/trips"; expectedPath = '/trips' },
    @{ app = 'rider'; slug = 'rider-account'; url = "$RiderBaseUrl/account"; expectedPath = '/account' },
    @{ app = 'rider'; slug = 'rider-receipt'; url = "$RiderBaseUrl/receipt?tripId=visual-qa-trip"; expectedPath = '/receipt' },
    @{ app = 'rider'; slug = 'rider-rating'; url = "$RiderBaseUrl/rating?tripId=visual-qa-trip&driverName=Issa%20Kabore&fare=2500&destination=Ouaga%202000"; expectedPath = '/rating' },
    @{ app = 'driver'; slug = 'driver-auth'; url = "$DriverBaseUrl/auth"; expectedPath = '/auth' },
    @{ app = 'driver'; slug = 'driver-onboarding'; url = "$DriverBaseUrl/onboarding"; expectedPath = '/onboarding' },
    @{ app = 'driver'; slug = 'driver-home'; url = "$DriverBaseUrl/accueil"; expectedPath = '/accueil' },
    @{ app = 'driver'; slug = 'driver-offers'; url = "$DriverBaseUrl/offres"; expectedPath = '/offres' },
    @{ app = 'driver'; slug = 'driver-earnings'; url = "$DriverBaseUrl/revenus"; expectedPath = '/revenus' },
    @{ app = 'driver'; slug = 'driver-profile'; url = "$DriverBaseUrl/profil"; expectedPath = '/profil' }
  )
}

$viewports = @(
  @{ slug = 'small-android'; width = 360; height = 740; scale = 3 },
  @{ slug = 'standard-android'; width = 390; height = 844; scale = 3 },
  @{ slug = 'mobile-web'; width = 430; height = 932; scale = 3 }
)

if ($TargetSlugs.Count -gt 0) {
  $selectedSlugs = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($slug in $TargetSlugs) {
    [void]$selectedSlugs.Add($slug)
  }
  $targets = @($targets | Where-Object { $selectedSlugs.Contains($_.slug) })
  if ($targets.Count -eq 0) {
    throw "No capture targets matched TargetSlugs: $($TargetSlugs -join ', ')."
  }
}

$target = Invoke-RestMethod -Method Put "$DebugUrl/json/new?about:blank"
if (-not $target.webSocketDebuggerUrl) {
  throw "No Chrome DevTools target found at $DebugUrl."
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$socket.ConnectAsync(
  [Uri]$target.webSocketDebuggerUrl,
  [System.Threading.CancellationToken]::None
).GetAwaiter().GetResult() | Out-Null

$report = [System.Collections.Generic.List[object]]::new()
$authReport = [System.Collections.Generic.List[object]]::new()

try {
  Invoke-Cdp -Socket $socket -Method 'Page.enable' | Out-Null
  Invoke-Cdp -Socket $socket -Method 'Runtime.enable' | Out-Null
  Invoke-Cdp -Socket $socket -Method 'Log.enable' | Out-Null

  if ($ApiBaseUrl) {
    $envScript = @"
(() => {
  globalThis.__orbiVisualQaErrors = [];
  globalThis.addEventListener?.('error', (event) => {
    globalThis.__orbiVisualQaErrors.push({
      type: 'error',
      message: String(event.message || ''),
      filename: String(event.filename || ''),
      lineno: event.lineno || 0,
      colno: event.colno || 0
    });
  });
  globalThis.addEventListener?.('unhandledrejection', (event) => {
    globalThis.__orbiVisualQaErrors.push({
      type: 'unhandledrejection',
      message: String(event.reason?.message || event.reason || '')
    });
  });
  const env = {
    ...(globalThis.process?.env || {}),
    EXPO_PUBLIC_API_BASE_URL: '$ApiBaseUrl',
    EXPO_PUBLIC_API_VERSION: '$ApiVersion',
    EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS: 'true',
    EXPO_PUBLIC_ORBI_DEMO_RIDER_EMAIL: '$RiderDemoEmail',
    EXPO_PUBLIC_ORBI_DEMO_RIDER_PASSWORD: '$RiderDemoPassword',
    EXPO_PUBLIC_ORBI_DEMO_DRIVER_EMAIL: '$DriverDemoEmail',
    EXPO_PUBLIC_ORBI_DEMO_DRIVER_PASSWORD: '$DriverDemoPassword',
    EXPO_PUBLIC_ORBI_VISUAL_QA: 'true'
  };
  globalThis.process = { ...(globalThis.process || {}), env };
})()
"@
    Invoke-Cdp -Socket $socket -Method 'Page.addScriptToEvaluateOnNewDocument' -Params @{
      source = $envScript
    } | Out-Null
  }

  if ($AuthenticateDemoSessions) {
    if ($RiderSessionToken) {
      $authReport.Add([pscustomobject]@{
        app = 'rider'
        result = Set-DemoSessionToken -Socket $socket -Url "$RiderBaseUrl/auth" -StorageKey 'orbi.rider.session-token' -Token $RiderSessionToken
      }) | Out-Null
    } else {
      $authReport.Add([pscustomobject]@{
        app = 'rider'
        result = Invoke-DemoSignIn -Socket $socket -Url "$RiderBaseUrl/auth" -ApiBaseUrl $ApiBaseUrl -Email $RiderDemoEmail -Password $RiderDemoPassword -StorageKey 'orbi.rider.session-token' -ButtonText 'Connexion compte de démonstration'
      }) | Out-Null
    }
    $authReportPath = Join-Path $OutputDir 'auth-report.json'
    $authReport | ConvertTo-Json -Depth 20 | Set-Content -Path $authReportPath -Encoding UTF8

    if ($DriverSessionToken) {
      $authReport.Add([pscustomobject]@{
        app = 'driver'
        result = Set-DemoSessionToken -Socket $socket -Url "$DriverBaseUrl/auth" -StorageKey 'orbi.driver.session-token' -Token $DriverSessionToken
      }) | Out-Null
    } else {
      $authReport.Add([pscustomobject]@{
        app = 'driver'
        result = Invoke-DemoSignIn -Socket $socket -Url "$DriverBaseUrl/auth" -ApiBaseUrl $ApiBaseUrl -Email $DriverDemoEmail -Password $DriverDemoPassword -StorageKey 'orbi.driver.session-token' -ButtonText 'Accès terrain sécurisé'
      }) | Out-Null
    }

    $authReport | ConvertTo-Json -Depth 20 | Set-Content -Path $authReportPath -Encoding UTF8

    $skipCaptures = [bool]$AuthOnly
  } else {
    $skipCaptures = $false
  }

  if (-not $skipCaptures) {
  foreach ($viewport in $viewports) {
    Invoke-Cdp -Socket $socket -Method 'Emulation.setDeviceMetricsOverride' -Params @{
      width = $viewport.width
      height = $viewport.height
      deviceScaleFactor = $viewport.scale
      mobile = $true
    } | Out-Null

    foreach ($targetRoute in $targets) {
      Write-Host "Capturing $($viewport.slug) $($targetRoute.slug)"
      try {
        if ($AuthenticateDemoSessions) {
          if ($targetRoute.app -eq 'rider') {
            if ($RiderSessionToken) {
              Set-DemoSessionToken -Socket $socket -Url "$RiderBaseUrl/auth" -StorageKey 'orbi.rider.session-token' -Token $RiderSessionToken | Out-Null
            } else {
              Invoke-DemoSignIn -Socket $socket -Url "$RiderBaseUrl/auth" -ApiBaseUrl $ApiBaseUrl -Email $RiderDemoEmail -Password $RiderDemoPassword -StorageKey 'orbi.rider.session-token' -ButtonText 'Connexion compte de démonstration' | Out-Null
            }
          } elseif ($targetRoute.app -eq 'driver') {
            if ($DriverSessionToken) {
              Set-DemoSessionToken -Socket $socket -Url "$DriverBaseUrl/auth" -StorageKey 'orbi.driver.session-token' -Token $DriverSessionToken | Out-Null
            } else {
              Invoke-DemoSignIn -Socket $socket -Url "$DriverBaseUrl/auth" -ApiBaseUrl $ApiBaseUrl -Email $DriverDemoEmail -Password $DriverDemoPassword -StorageKey 'orbi.driver.session-token' -ButtonText 'Accès terrain sécurisé' | Out-Null
            }
          }
        }
        Invoke-Cdp -Socket $socket -Method 'Page.navigate' -Params @{ url = $targetRoute.url } -TimeoutMs 20000 | Out-Null
        $state = Wait-MobileVisualState -Socket $socket -TimeoutMs 55000

        $screenshot = Invoke-Cdp -Socket $socket -Method 'Page.captureScreenshot' -Params @{
          format = 'png'
          captureBeyondViewport = $false
        } -TimeoutMs 20000
        $fileName = "$($viewport.slug)-$($targetRoute.slug).png"
        $filePath = Join-Path $OutputDir $fileName
        [System.IO.File]::WriteAllBytes($filePath, [Convert]::FromBase64String($screenshot.data))

        $report.Add([pscustomobject]@{
          viewport = $viewport.slug
          route = $targetRoute.slug
          url = $state.url
          expectedPath = $targetRoute.expectedPath
          routeMismatch = -not ([Uri]$state.url).AbsolutePath.Equals($targetRoute.expectedPath)
          blockedByAuth = ([Uri]$state.url).AbsolutePath.Equals('/auth') -and -not $targetRoute.expectedPath.Equals('/auth')
          screenshot = $filePath
          hasExpoOverlay = $state.hasExpoOverlay
          isBlank = $state.isBlank
          bodyScrollWidth = $state.bodyScrollWidth
          viewportWidth = $state.viewportWidth
          rootHtmlLength = $state.rootHtmlLength
          authenticatedDemoSessions = [bool]$AuthenticateDemoSessions
          captureError = ''
          scripts = $state.scripts
          runtimeErrors = $state.runtimeErrors
          overflow = $state.overflow
          textSample = $state.textSample
          visualGate = if ($state.isBlank) {
            'blank'
          } elseif ($state.hasExpoOverlay) {
            'expo-overlay'
          } elseif (([Uri]$state.url).AbsolutePath.Equals('/auth') -and -not $targetRoute.expectedPath.Equals('/auth')) {
            'blocked-by-auth'
          } elseif (-not ([Uri]$state.url).AbsolutePath.Equals($targetRoute.expectedPath)) {
            'route-mismatch'
          } elseif ($state.overflow.Count -gt 0) {
            'overflow'
          } else {
            'pass'
          }
        }) | Out-Null
      } catch {
        $report.Add([pscustomobject]@{
          viewport = $viewport.slug
          route = $targetRoute.slug
          url = $targetRoute.url
          expectedPath = $targetRoute.expectedPath
          routeMismatch = $false
          blockedByAuth = $false
          screenshot = ''
          hasExpoOverlay = $false
          isBlank = $true
          bodyScrollWidth = 0
          viewportWidth = $viewport.width
          rootHtmlLength = 0
          authenticatedDemoSessions = [bool]$AuthenticateDemoSessions
          captureError = $_.Exception.Message
          scripts = @()
          runtimeErrors = @()
          overflow = @()
          textSample = ''
          visualGate = 'capture-error'
        }) | Out-Null
        Write-Warning "Capture failed for $($viewport.slug) $($targetRoute.slug): $($_.Exception.Message)"
      }
    }
  }
  }
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    try {
      $socket.CloseOutputAsync(
        [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
        'done',
        [System.Threading.CancellationToken]::None
      ).GetAwaiter().GetResult() | Out-Null
    } catch {
      Write-Warning "Chrome DevTools websocket close warning: $($_.Exception.Message)"
    }
  }

  $socket.Dispose()
}

$reportPath = Join-Path $OutputDir 'report.json'
$report | ConvertTo-Json -Depth 20 | Set-Content -Path $reportPath -Encoding UTF8
if ($AuthenticateDemoSessions) {
  $authReportPath = Join-Path $OutputDir 'auth-report.json'
  $authReport | ConvertTo-Json -Depth 20 | Set-Content -Path $authReportPath -Encoding UTF8
}
Write-Host "Mobile visual captures written to $OutputDir"
