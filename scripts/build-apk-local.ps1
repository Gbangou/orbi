# build-apk-local.ps1
# Genere les APK Android directement sur cette machine sans passer par EAS Cloud.
# Usage:
#   .\scripts\build-apk-local.ps1 -App rider
#   .\scripts\build-apk-local.ps1 -App driver
#   .\scripts\build-apk-local.ps1 -App all
#
# Variables d'environnement respectees si deja definies:
#   ANDROID_HOME  →  C:\Android\Sdk (par defaut)
#   JAVA_HOME     →  C:\Android\jdk17\jdk-17.0.19+10 (par defaut)

param(
    [ValidateSet('rider', 'driver', 'all')]
    [string]$App = 'all',
    [string]$ApiBaseUrl
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent

$env:CI = "true"
$env:EXPO_NO_TELEMETRY = "1"
$env:NODE_ENV = "production"
if (-not $env:GRADLE_OPTS) {
    $env:GRADLE_OPTS = "-Dfile.encoding=UTF-8"
}

# Valeurs par defaut Android SDK + JDK Temurin 17 portables
if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = "C:\Android\Sdk"
    Write-Host "  ANDROID_HOME → $env:ANDROID_HOME" -ForegroundColor DarkGray
}
if (-not $env:JAVA_HOME) {
    $env:JAVA_HOME = "C:\Android\jdk17\jdk-17.0.19+10"
    Write-Host "  JAVA_HOME → $env:JAVA_HOME" -ForegroundColor DarkGray
}
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

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

    $lanIp = Resolve-LanIp
    return "http://${lanIp}:3000"
}

$ResolvedApiBaseUrl = Resolve-ApiBaseUrl -ExplicitApiBaseUrl $ApiBaseUrl
Write-Host "  Mobile API base URL → $ResolvedApiBaseUrl" -ForegroundColor Cyan

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

    # Expo prebuild : genere le dossier android/
    Write-Host "  expo prebuild --platform android --clean ..." -ForegroundColor Yellow
    npx expo prebuild --platform android --clean
    if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed for $AppName" }

    # local.properties : pointe vers le SDK Android
    $localProps = "sdk.dir=$($env:ANDROID_HOME -replace '\\', '\\\\')"
    Set-Content -Path "$AppDir\android\local.properties" -Value $localProps -Encoding UTF8
    Write-Host "  android/local.properties → $env:ANDROID_HOME" -ForegroundColor DarkGray

    # Expo regenere android/ a chaque build propre. Reappliquer une marge memoire
    # suffisante evite les builds release fragiles sur Windows.
    $GradlePropsPath = "$AppDir\android\gradle.properties"
    $GradleProps = Get-Content $GradlePropsPath -Raw
    $GradleJvmArgs = "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8"
    if ($GradleProps -match "(?m)^org\.gradle\.jvmargs=.*$") {
        $GradleProps = $GradleProps -replace "(?m)^org\.gradle\.jvmargs=.*$", $GradleJvmArgs
    }
    else {
        $GradleProps = "$GradleProps`n$GradleJvmArgs`n"
    }
    Set-Content -Path $GradlePropsPath -Value $GradleProps -Encoding UTF8
    Write-Host "  android/gradle.properties → release JVM tuned" -ForegroundColor DarkGray

    # Restaurer le keystore stable pour que la signature reste identique entre les builds.
    # Sans ca, expo prebuild --clean genere un nouveau keystore a chaque fois et Android
    # refuse d'installer l'APK par-dessus une version precedente (signature conflict).
    $StableKeystore = "$AppDir\signing\debug.keystore"
    $AndroidKeystore = "$AppDir\android\app\debug.keystore"
    if (Test-Path $StableKeystore) {
        Copy-Item $StableKeystore $AndroidKeystore -Force
        Write-Host "  android/app/debug.keystore ← signing/debug.keystore (signature stable)" -ForegroundColor DarkGray
    }
    else {
        Write-Host "  WARNING: signing/debug.keystore absent — Gradle va generer un nouveau keystore (signature instable)" -ForegroundColor Yellow
    }

    # Ecrire .env dans le dossier app avant Gradle pour que Metro charge les vars EXPO_PUBLIC_*.
    # Metro (@expo/env) lit ce fichier au demarrage du bundler ; sans ca, les vars ne sont pas
    # injectees dans le bundle et le fallback 'localhost:3000' de packages/config est utilise.
    $EnvLines = $EnvVars.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
    $EnvFileContent = $EnvLines -join "`n"
    Set-Content -Path "$AppDir\.env" -Value $EnvFileContent -Encoding UTF8
    Write-Host "  $AppDir\.env written ($($EnvVars.Count) vars)" -ForegroundColor DarkGray

    # Gradle assembleRelease → .apk
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

    Write-Host "  APK → dist\orbi-$AppName-mvp.apk" -ForegroundColor Green
    Set-Location $Root
}

# Verifications prerequis
Write-Host "Checking prerequisites..." -ForegroundColor DarkGray
try { $null = & "$env:JAVA_HOME\bin\java.exe" -version 2>&1; Write-Host "  Java: OK ($env:JAVA_HOME)" -ForegroundColor DarkGray } catch { throw "Java not found at $env:JAVA_HOME" }
if (-not (Test-Path "$env:ANDROID_HOME\platforms")) { Write-Host "  WARNING: ANDROID_HOME may be incomplete: $env:ANDROID_HOME" -ForegroundColor Yellow }

Set-Location $Root
pnpm install --frozen-lockfile --config.offline=false
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

# Variables d'environnement communes aux deux apps
$CommonEnv = @{
    EXPO_PUBLIC_API_BASE_URL         = $ResolvedApiBaseUrl
    EXPO_PUBLIC_API_VERSION          = "v1"
    EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS = "true"
}

if ($App -eq 'rider' -or $App -eq 'all') {
    Build-App -AppName 'rider' -AppDir "$Root\apps\rider-app" -EnvVars ($CommonEnv + @{
            EXPO_PUBLIC_ORBI_DEMO_RIDER_EMAIL    = "testpassager@orbi.test"
            EXPO_PUBLIC_ORBI_DEMO_RIDER_PASSWORD = "TestOrbi2026!"
        })
}
if ($App -eq 'driver' -or $App -eq 'all') {
    Build-App -AppName 'driver' -AppDir "$Root\apps\driver-app" -EnvVars ($CommonEnv + @{
            EXPO_PUBLIC_ORBI_DEMO_DRIVER_EMAIL    = "testchauffeur@orbi.test"
            EXPO_PUBLIC_ORBI_DEMO_DRIVER_PASSWORD = "TestOrbi2026!"
        })
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
