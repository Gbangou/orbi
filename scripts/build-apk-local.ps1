# build-apk-local.ps1
# Genere les APK Android directement sur cette machine sans passer par EAS Cloud.
# Usage:
#   .\scripts\build-apk-local.ps1 -App rider -ApiUrl http://192.168.1.50:3000
#   .\scripts\build-apk-local.ps1 -App driver -ApiUrl http://192.168.1.50:3000
#   .\scripts\build-apk-local.ps1 -App all   -ApiUrl http://192.168.1.50:3000
#
# Prerequis:
#   - Java 17+ dans PATH  (java -version)
#   - Android SDK avec ANDROID_HOME defini
#   - Node 22 + pnpm 10

param(
    [ValidateSet('rider','driver','all')]
    [string]$App = 'all',

    [string]$ApiUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent

function Build-App {
    param([string]$AppName, [string]$AppDir, [string]$ApiBaseUrl)

    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " Building $AppName APK" -ForegroundColor Cyan
    Write-Host " API → $ApiBaseUrl" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan

    Set-Location $AppDir

    # Injecter l'URL dans le .env.local (bake a la compilation)
    $envContent = @"
EXPO_PUBLIC_API_BASE_URL=$ApiBaseUrl
EXPO_PUBLIC_API_VERSION=v1
"@
    Set-Content -Path "$AppDir\.env.local" -Value $envContent -Encoding UTF8
    Write-Host "  .env.local → $ApiBaseUrl" -ForegroundColor DarkGray

    # Expo prebuild : genere le dossier android/
    Write-Host "  expo prebuild --platform android --clean ..." -ForegroundColor Yellow
    npx expo prebuild --platform android --clean
    if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed for $AppName" }

    # Gradle assembleRelease → .apk
    Write-Host "  gradlew assembleRelease ..." -ForegroundColor Yellow
    Set-Location "$AppDir\android"
    if ($IsWindows -or $env:OS -match 'Windows') {
        .\gradlew.bat assembleRelease
    } else {
        ./gradlew assembleRelease
    }
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
try { $jv = java -version 2>&1; Write-Host "  Java: OK" -ForegroundColor DarkGray } catch { throw "Java not found. Install Java 17+." }
if (-not $env:ANDROID_HOME) { Write-Host "  WARNING: ANDROID_HOME not set" -ForegroundColor Yellow }

Set-Location $Root
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

if ($App -eq 'rider' -or $App -eq 'all') {
    Build-App -AppName 'rider' -AppDir "$Root\apps\rider-app" -ApiBaseUrl $ApiUrl
}
if ($App -eq 'driver' -or $App -eq 'all') {
    Build-App -AppName 'driver' -AppDir "$Root\apps\driver-app" -ApiBaseUrl $ApiUrl
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host " DONE — APKs in dist\" -ForegroundColor Green
Write-Host " Install on device:" -ForegroundColor Green
if ($App -eq 'rider' -or $App -eq 'all') {
    Write-Host "   adb install dist\orbi-rider-mvp.apk" -ForegroundColor White
}
if ($App -eq 'driver' -or $App -eq 'all') {
    Write-Host "   adb install dist\orbi-driver-mvp.apk" -ForegroundColor White
}
Write-Host "======================================" -ForegroundColor Green
