# build-apk-local.ps1
# Genere les APK Android directement sur cette machine sans passer par EAS Cloud.
# Usage:
#   .\scripts\build-apk-local.ps1 -App rider
#   .\scripts\build-apk-local.ps1 -App driver
#   .\scripts\build-apk-local.ps1 -App all
#   .\scripts\build-apk-local.ps1 -App all -ApiBaseUrl http://192.168.1.20:3000
#
# Variables d'environnement respectees si deja definies:
#   ANDROID_HOME  -> C:\Android\Sdk (par defaut)
#   JAVA_HOME     -> C:\Android\jdk17\jdk-17.0.19+10 (par defaut)

param(
    [ValidateSet('rider', 'driver', 'all')]
    [string]$App = 'all',
    [string]$ApiBaseUrl
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$DefaultFieldApiBaseUrl = "https://orbi-field-api.onrender.com"

$env:CI = "true"
$env:EXPO_NO_TELEMETRY = "1"
$env:EXPO_NO_GIT_STATUS = "1"
$env:NODE_ENV = "production"
if (-not $env:GRADLE_OPTS) {
    $env:GRADLE_OPTS = "-Dfile.encoding=UTF-8"
}

# Valeurs par defaut Android SDK + JDK Temurin 17 portables
if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = "C:\Android\Sdk"
    Write-Host "  ANDROID_HOME -> $env:ANDROID_HOME" -ForegroundColor DarkGray
}
if (-not $env:JAVA_HOME) {
    $env:JAVA_HOME = "C:\Android\jdk17\jdk-17.0.19+10"
    Write-Host "  JAVA_HOME -> $env:JAVA_HOME" -ForegroundColor DarkGray
}
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

function Resolve-LanIp {
    try {
        $addresses = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown' -and
            $_.InterfaceOperationalStatus -eq 'Up' -and
            $_.InterfaceAlias -notmatch '(?i)vEthernet|WSL|Docker|Loopback|Virtual|VPN|Bluetooth|Tailscale|ZeroTier|Hyper-V'
        } |
        Sort-Object `
        @{ Expression = { if ($_.InterfaceAlias -match '(?i)Wi-Fi|Wireless|WLAN|Ethernet') { 0 } else { 1 } } },
        InterfaceMetric,
        InterfaceIndex

        if ($addresses) {
            return $addresses[0].IPAddress
        }
    }
    catch {
        Write-Host '  Get-NetIPAddress unavailable; falling back to ipconfig.' -ForegroundColor Yellow
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

    $ipAddressMatches = $ipconfig | Select-String -Pattern 'IPv4.*?:\s*(\d+\.\d+\.\d+\.\d+)'
    $candidate = $ipAddressMatches |
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

    throw 'Unable to find an active LAN IPv4 address. Pass one explicitly: pnpm mobile:apk:rider -- -ApiBaseUrl http://192.168.1.20:3000'
}

function Resolve-ApiBaseUrl {
    param([string]$ExplicitApiBaseUrl)

    if ($ExplicitApiBaseUrl) {
        return $ExplicitApiBaseUrl
    }

    if ($env:ORBI_FIELD_API_BASE_URL) {
        return $env:ORBI_FIELD_API_BASE_URL
    }

    return $DefaultFieldApiBaseUrl
}

$ResolvedApiBaseUrl = Resolve-ApiBaseUrl -ExplicitApiBaseUrl $ApiBaseUrl
Write-Host "  Mobile API base URL -> $ResolvedApiBaseUrl" -ForegroundColor Cyan

function Test-MobileApiBaseUrl {
    param([string]$BaseUrl)

    $readyUrl = "$BaseUrl/api/v1/health/ready"
    Write-Host "  Checking mobile API readiness -> $readyUrl" -ForegroundColor DarkGray
    $lastErrorMessage = $null

    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            $requestArgs = @{
                Uri             = $readyUrl
                UseBasicParsing = $true
                TimeoutSec      = 15
            }

            $requestArgs.NoProxy = $true

            $response = Invoke-WebRequest @requestArgs
            $body = $response.Content | ConvertFrom-Json

            if ($response.StatusCode -ne 200 -or $body.status -ne 'ready') {
                throw "HTTP $($response.StatusCode), status '$($body.status)'"
            }

            Write-Host "  Mobile API readiness: OK" -ForegroundColor Green
            return
        }
        catch {
            $lastErrorMessage = $_.Exception.Message
            try {
                $nodeCheck = @'
const url = process.argv[1];
fetch(url)
  .then(async (response) => {
    const body = await response.json();
    if (!response.ok || body.status !== 'ready') {
      throw new Error(`HTTP ${response.status}, status '${body.status}'`);
    }
  })
  .catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  });
'@
                $nodeOutput = node -e $nodeCheck $readyUrl 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  Mobile API readiness: OK (node fallback)" -ForegroundColor Green
                    return
                }
                $lastErrorMessage = "$lastErrorMessage; node fallback: $($nodeOutput -join ' ')"
            }
            catch {
                $lastErrorMessage = "$lastErrorMessage; node fallback: $($_.Exception.Message)"
            }

            if ($attempt -lt 4) {
                Write-Host "  Mobile API readiness retry $attempt/4: $lastErrorMessage" -ForegroundColor Yellow
                Start-Sleep -Seconds ([Math]::Min(20, 3 * $attempt))
            }
        }
    }

    throw @"
Mobile API is not reachable from the configured APK URL:
  $readyUrl

Start or deploy the backend targeted by this APK, then pass the exact URL explicitly:
  pnpm mobile:apk -- -ApiBaseUrl http://YOUR_WIFI_IP:3000
  pnpm mobile:apk -- -ApiBaseUrl https://orbi-field-api.onrender.com

Details: $lastErrorMessage
"@
}

Test-MobileApiBaseUrl -BaseUrl $ResolvedApiBaseUrl

function Assert-NoReactNativeSvg {
    param([string]$Scope, [string[]]$Paths)

    $ExistingPaths = @($Paths | Where-Object { Test-Path $_ })
    if ($ExistingPaths.Count -eq 0) {
        return
    }

    $Pattern = 'react-native-svg|RNSVG|com\.horcrux'
    $Matches = @()

    if (Get-Command rg -ErrorAction SilentlyContinue) {
        $Matches = @(& rg -n $Pattern @ExistingPaths 2>$null)
        if ($LASTEXITCODE -gt 1) {
            throw "Unable to scan $Scope for forbidden React Native SVG bindings."
        }
    }
    else {
        foreach ($Path in $ExistingPaths) {
            if (Test-Path $Path -PathType Container) {
                $Matches += Get-ChildItem $Path -File -Recurse |
                Select-String -Pattern $Pattern |
                ForEach-Object { "$($_.Path):$($_.LineNumber):$($_.Line)" }
            }
            else {
                $Matches += Select-String -Path $Path -Pattern $Pattern |
                ForEach-Object { "$($_.Path):$($_.LineNumber):$($_.Line)" }
            }
        }
    }

    if ($Matches.Count -gt 0) {
        $Message = @(
            "Forbidden native SVG dependency found while checking $Scope.",
            "This can reintroduce the Android crash:",
            "  View config getter callback for component 'RNSVGLinearGradient' must be a function",
            "",
            ($Matches -join "`n")
        ) -join "`n"
        throw $Message
    }

    Write-Host "  React Native SVG native guard: OK ($Scope)" -ForegroundColor DarkGray
}

function Build-App {
    param([string]$AppName, [string]$AppDir, [hashtable]$EnvVars)

    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " Building $AppName APK" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan

    Set-Location $AppDir

    # Injecter les variables d'environnement expo
    foreach ($kv in $EnvVars.GetEnumerator()) {
        [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, 'Process')
    }

    $ExistingGradleWrapper = "$AppDir\android\gradlew.bat"
    if (Test-Path $ExistingGradleWrapper) {
        Write-Host "  stopping existing Gradle daemons ..." -ForegroundColor DarkGray
        Push-Location "$AppDir\android"
        try {
            .\gradlew.bat --stop | Out-Null
        }
        catch {
            Write-Host "  Gradle daemon stop skipped: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        finally {
            Pop-Location
        }
    }

    # Expo prebuild : genere le dossier android/
    Write-Host "  expo prebuild --platform android --clean ..." -ForegroundColor Yellow
    pnpm exec expo prebuild --platform android --clean --no-install
    if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed for $AppName" }
    Assert-NoReactNativeSvg -Scope "$AppName generated Android project" -Paths @("$AppDir\android")

    # local.properties : pointe vers le SDK Android
    $localProps = "sdk.dir=$($env:ANDROID_HOME -replace '\\', '\\\\')"
    Set-Content -Path "$AppDir\android\local.properties" -Value $localProps -Encoding UTF8
    Write-Host "  android/local.properties -> $env:ANDROID_HOME" -ForegroundColor DarkGray

    # Expo regenere android/ a chaque build propre. Reappliquer une marge memoire
    # suffisante evite les builds release fragiles sur Windows.
    $GradlePropsPath = "$AppDir\android\gradle.properties"
    $GradleProps = Get-Content $GradlePropsPath -Raw
    $GradleJvmArgs = "org.gradle.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8"
    if ($GradleProps -match "(?m)^org\.gradle\.jvmargs=.*$") {
        $GradleProps = $GradleProps -replace "(?m)^org\.gradle\.jvmargs=.*$", $GradleJvmArgs
    }
    else {
        $GradleProps = "$GradleProps`n$GradleJvmArgs`n"
    }
    Set-Content -Path $GradlePropsPath -Value $GradleProps -Encoding UTF8
    Write-Host "  android/gradle.properties -> release JVM tuned" -ForegroundColor DarkGray

    # Restaurer le keystore stable pour que la signature reste identique entre les builds.
    # Sans ca, expo prebuild --clean genere un nouveau keystore a chaque fois et Android
    # refuse d'installer l'APK par-dessus une version precedente (signature conflict).
    $StableKeystore = "$AppDir\signing\debug.keystore"
    $AndroidKeystore = "$AppDir\android\app\debug.keystore"
    if (Test-Path $StableKeystore) {
        Copy-Item $StableKeystore $AndroidKeystore -Force
        Write-Host "  android/app/debug.keystore <- signing/debug.keystore (signature stable)" -ForegroundColor DarkGray
    }
    else {
        Write-Host "  WARNING: signing/debug.keystore absent - Gradle va generer un nouveau keystore (signature instable)" -ForegroundColor Yellow
    }

    # Ecrire .env dans le dossier app avant Gradle pour que Metro charge les vars EXPO_PUBLIC_*.
    # Metro (@expo/env) lit ce fichier au demarrage du bundler ; sans ca, les vars ne sont pas
    # injectees dans le bundle et le fallback 'localhost:3000' de packages/config est utilise.
    $EnvLines = $EnvVars.GetEnumerator() | ForEach-Object { '{0}={1}' -f $_.Key, $_.Value }
    $EnvFileContent = $EnvLines -join "`n"
    Set-Content -Path "$AppDir\.env" -Value $EnvFileContent -Encoding UTF8
    Write-Host "  app .env written" -ForegroundColor DarkGray

    # Gradle assembleRelease -> .apk
    Write-Host "  gradlew assembleRelease ..." -ForegroundColor Yellow
    Set-Location "$AppDir\android"
    .\gradlew.bat assembleRelease

    $ApkSrc = "$AppDir\android\app\build\outputs\apk\release\app-release.apk"
    if ($LASTEXITCODE -ne 0) {
        if (-not (Test-Path $ApkSrc)) {
            throw "Gradle build failed for $AppName"
        }

        $BuildToolsDir = Get-ChildItem "$env:ANDROID_HOME\build-tools" -Directory |
        Sort-Object Name -Descending |
        Select-Object -First 1
        $ApkSigner = "$($BuildToolsDir.FullName)\apksigner.bat"
        if (-not (Test-Path $ApkSigner)) {
            throw "Gradle build failed for $AppName and apksigner was not found."
        }

        & $ApkSigner verify --verbose $ApkSrc
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed for $AppName and generated APK signature verification failed."
        }

        Write-Host "  WARNING: Gradle exited non-zero after producing a signed APK; copying verified APK." -ForegroundColor Yellow
    }

    # Copier l'APK dans dist/
    $DistDir = "$Root\dist"
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
    $ApkDst = "$DistDir\orbi-$AppName-mvp.apk"
    Copy-Item $ApkSrc $ApkDst -Force
    $ApkFile = Get-Item $ApkDst
    $ApkHash = (Get-FileHash -Algorithm SHA256 $ApkDst).Hash.ToLowerInvariant()
    $AppConfig = Get-Content "$AppDir\app.json" -Raw | ConvertFrom-Json
    $BuildProof = [ordered]@{
        app = $AppName
        apkPath = "dist/orbi-$AppName-mvp.apk"
        package = $AppConfig.expo.android.package
        version = $AppConfig.expo.version
        versionCode = $AppConfig.expo.android.versionCode
        apiBaseUrl = $ResolvedApiBaseUrl
        apiVersion = $EnvVars.EXPO_PUBLIC_API_VERSION
        builtAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        sizeBytes = $ApkFile.Length
        sha256 = $ApkHash
    }
    $BuildProof | ConvertTo-Json -Depth 5 | Set-Content "$DistDir\orbi-$AppName-mvp.apk.json" -Encoding UTF8

    Write-Host "  APK -> dist\orbi-$AppName-mvp.apk" -ForegroundColor Green
    Write-Host "  proof -> dist\orbi-$AppName-mvp.apk.json" -ForegroundColor Green
    Set-Location $Root
}

# Verifications prerequis
Write-Host "Checking prerequisites..." -ForegroundColor DarkGray
try { $null = & "$env:JAVA_HOME\bin\java.exe" -version 2>&1; Write-Host "  Java: OK ($env:JAVA_HOME)" -ForegroundColor DarkGray } catch { throw "Java not found at $env:JAVA_HOME" }
if (-not (Test-Path "$env:ANDROID_HOME\platforms")) { Write-Host "  WARNING: ANDROID_HOME may be incomplete: $env:ANDROID_HOME" -ForegroundColor Yellow }

Set-Location $Root
pnpm install --frozen-lockfile --config.offline=false
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
Assert-NoReactNativeSvg -Scope "workspace mobile dependencies" -Paths @(
    "$Root\apps\rider-app\package.json",
    "$Root\apps\driver-app\package.json",
    "$Root\packages\ui\package.json",
    "$Root\pnpm-lock.yaml"
)

# Variables d'environnement communes aux deux apps
$CommonEnv = @{
    EXPO_PUBLIC_API_BASE_URL = $ResolvedApiBaseUrl
    EXPO_PUBLIC_API_VERSION  = "v1"
}

if ($App -eq 'rider' -or $App -eq 'all') {
    $RiderEnv = $CommonEnv.Clone()
    Build-App -AppName 'rider' -AppDir "$Root\apps\rider-app" -EnvVars $RiderEnv
}
if ($App -eq 'driver' -or $App -eq 'all') {
    $DriverEnv = $CommonEnv.Clone()
    Build-App -AppName 'driver' -AppDir "$Root\apps\driver-app" -EnvVars $DriverEnv
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host " DONE - APKs in dist/" -ForegroundColor Green
Write-Host " Install via USB:" -ForegroundColor Green
if ($App -eq 'rider' -or $App -eq 'all') {
    Write-Host "   adb install dist\orbi-rider-mvp.apk" -ForegroundColor White
}
if ($App -eq 'driver' -or $App -eq 'all') {
    Write-Host "   adb install dist\orbi-driver-mvp.apk" -ForegroundColor White
}
Write-Host "======================================" -ForegroundColor Green
