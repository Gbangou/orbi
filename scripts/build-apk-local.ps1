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
    [ValidateSet('rider','driver','all')]
    [string]$App = 'all'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent

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

    # Restaurer le keystore stable pour que la signature reste identique entre les builds.
    # Sans ca, expo prebuild --clean genere un nouveau keystore a chaque fois et Android
    # refuse d'installer l'APK par-dessus une version precedente (signature conflict).
    $StableKeystore = "$AppDir\signing\debug.keystore"
    $AndroidKeystore = "$AppDir\android\app\debug.keystore"
    if (Test-Path $StableKeystore) {
        Copy-Item $StableKeystore $AndroidKeystore -Force
        Write-Host "  android/app/debug.keystore ← signing/debug.keystore (signature stable)" -ForegroundColor DarkGray
    } else {
        Write-Host "  WARNING: signing/debug.keystore absent — Gradle va generer un nouveau keystore (signature instable)" -ForegroundColor Yellow
    }

    # Ecrire .env dans le dossier app avant Gradle pour que Metro charge les vars EXPO_PUBLIC_*.
    # Metro (@expo/env) lit ce fichier au demarrage du bundler ; sans ca, les vars ne sont pas
    # injectees dans le bundle et le fallback 'localhost:3000' de packages/config est utilise.
    $EnvLines = $EnvVars.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
    $EnvFileContent = $EnvLines -join "`n"
    Set-Content -Path "$AppDir\.env" -Value $EnvFileContent -Encoding UTF8
    Write-Host "  $AppDir\.env ecrit ($($EnvVars.Count) vars EXPO_PUBLIC_*)" -ForegroundColor DarkGray

    # Gradle assembleRelease → .apk
    Write-Host "  gradlew assembleRelease ..." -ForegroundColor Yellow
    Set-Location "$AppDir\android"
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed for $AppName" }

    # Copier l'APK dans dist/
    $ApkSrc = "$AppDir\android\app\build\outputs\apk\release\app-release.apk"
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
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

# NODE_ENV=production requis par expo-constants:createExpoConfig (sinon warning + mode-specific .env ignore)
$env:NODE_ENV = "production"

# Variables d'environnement communes aux deux apps
$CommonEnv = @{
    EXPO_PUBLIC_API_BASE_URL    = "https://backend-production-d5d1.up.railway.app"
    EXPO_PUBLIC_API_VERSION     = "v1"
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
Write-Host " DONE — APKs in dist\" -ForegroundColor Green
Write-Host " Installer via USB:" -ForegroundColor Green
if ($App -eq 'rider' -or $App -eq 'all') {
    Write-Host "   adb install dist\orbi-rider-mvp.apk" -ForegroundColor White
}
if ($App -eq 'driver' -or $App -eq 'all') {
    Write-Host "   adb install dist\orbi-driver-mvp.apk" -ForegroundColor White
}
Write-Host "======================================" -ForegroundColor Green
