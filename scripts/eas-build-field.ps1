# eas-build-field.ps1
# Build APKs pour tests terrain sur vrais telephones (donnees mobiles).
#
# USAGE:
#   pnpm mobile:field --ApiUrl https://api.monserveur.com
#   pnpm mobile:field --ApiUrl https://api.monserveur.com --App rider
#   pnpm mobile:field --ApiUrl https://api.monserveur.com --App driver
#   pnpm mobile:field --ApiUrl https://api.monserveur.com --Profile preview
#
# PREREQUIS:
#   npm install -g eas-cli
#   eas login   (compte Expo / EAS)
#
# RESULTAT:
#   EAS Cloud lance le build, vous recevez un lien de telechargement.
#   Installez l'APK sur le telephone : adb install <fichier>.apk
#   ou scannez le QR code depuis le tableau de bord EAS.

param(
    [Parameter(Mandatory = $true)]
    [string]$ApiUrl,

    [ValidateSet('rider', 'driver', 'all')]
    [string]$App = 'all',

    [ValidateSet('mvp', 'preview', 'development')]
    [string]$Profile = 'mvp'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent

# Validation URL
if (-not ($ApiUrl -match '^https://')) {
    Write-Error "ApiUrl doit commencer par https:// pour un test terrain mobile serieux (ex: https://api-staging.orbi.app)"
    exit 1
}
$ApiUrl = $ApiUrl.TrimEnd('/')

if ($ApiUrl -match 'localhost|127\.0\.0\.1|0\.0\.0\.0|\.local($|/)') {
    Write-Error "ApiUrl doit etre une URL publique stable, pas une adresse locale: $ApiUrl"
    exit 1
}

$healthUrl = "$ApiUrl/api/v1/health/ready"
try {
    $health = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 20 -Headers @{"ngrok-skip-browser-warning"="true"}
    if ($health.StatusCode -ne 200 -or $health.Content -notmatch '"status"\s*:\s*"ready"') {
        Write-Error "Le backend public ne repond pas ready sur $healthUrl. Reponse: $($health.Content)"
        exit 1
    }
} catch {
    Write-Error "Impossible de joindre le backend public avant build APK: $healthUrl. $($_.Exception.Message)"
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "          ORBI - BUILD TERRAIN APK                " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Backend URL : $ApiUrl" -ForegroundColor White
Write-Host "  Health      : $healthUrl -> ready" -ForegroundColor Green
Write-Host "  Profil      : $Profile" -ForegroundColor White
Write-Host "  Apps        : $App" -ForegroundColor White
Write-Host ""

# Verification eas-cli
try {
    $easVersion = eas --version 2>&1
    Write-Host "  eas-cli : $easVersion" -ForegroundColor DarkGray
} catch {
    Write-Error @"
eas-cli introuvable. Installez-le :
  npm install -g eas-cli
  eas login
"@
    exit 1
}

# Injection URL dans eas.json (uniquement si le profil n'a pas deja une URL)
function Set-EasApiUrl {
    param([string]$AppDir, [string]$AppLabel)

    $easPath = "$AppDir\eas.json"
    $easJson  = Get-Content $easPath -Raw | ConvertFrom-Json

    # Si l'URL est deja presente dans le profil, ne rien modifier
    $existingUrl = $easJson.build.$Profile.env.EXPO_PUBLIC_API_BASE_URL
    if ($existingUrl -and $existingUrl -eq $ApiUrl) {
        Write-Host "  [$AppLabel] eas.json deja configure - URL: $ApiUrl" -ForegroundColor DarkGray
        return
    }

    if (-not $easJson.build.$Profile.env) {
        $easJson.build.$Profile | Add-Member -NotePropertyName 'env' -NotePropertyValue ([PSCustomObject]@{}) -Force
    }
    $easJson.build.$Profile.env | Add-Member -NotePropertyName 'EXPO_PUBLIC_API_BASE_URL' -NotePropertyValue $ApiUrl -Force
    $easJson.build.$Profile.env | Add-Member -NotePropertyName 'EXPO_PUBLIC_API_VERSION'  -NotePropertyValue 'v1'     -Force

    $easJson | ConvertTo-Json -Depth 10 | Set-Content $easPath -Encoding UTF8
    Write-Host "  [$AppLabel] eas.json mis a jour - URL: $ApiUrl" -ForegroundColor DarkGray
}

# Restauration eas.json apres build (ne touche pas les profils qui avaient deja l'URL)
function Reset-EasApiUrl {
    param([string]$AppDir, [string]$AppLabel)

    $easPath = "$AppDir\eas.json"
    $easJson  = Get-Content $easPath -Raw | ConvertFrom-Json

    # Si l'URL baked est la meme que celle passee en parametre, ne pas la supprimer
    $existingUrl = $easJson.build.$Profile.env.EXPO_PUBLIC_API_BASE_URL
    if ($existingUrl -and $existingUrl -eq $ApiUrl) {
        Write-Host "  [$AppLabel] eas.json conserve (URL deja presente dans le profil)" -ForegroundColor DarkGray
        return
    }

    $envObj = $easJson.build.$Profile.env
    if ($envObj.PSObject.Properties['EXPO_PUBLIC_API_BASE_URL']) {
        $envObj.PSObject.Properties.Remove('EXPO_PUBLIC_API_BASE_URL')
    }

    $easJson | ConvertTo-Json -Depth 10 | Set-Content $easPath -Encoding UTF8
    Write-Host "  [$AppLabel] eas.json restaure" -ForegroundColor DarkGray
}

# Build EAS Cloud
function Build-EasApp {
    param([string]$AppDir, [string]$AppLabel)

    Write-Host ""
    Write-Host "  Build $AppLabel ($Profile)" -ForegroundColor Cyan

    Set-EasApiUrl -AppDir $AppDir -AppLabel $AppLabel
    Set-Location $AppDir

    try {
        eas build --platform android --profile $Profile --non-interactive
        if ($LASTEXITCODE -ne 0) { throw "EAS build failed for $AppLabel" }
        Write-Host "  $AppLabel : BUILD SOUMIS OK" -ForegroundColor Green
    } finally {
        Reset-EasApiUrl -AppDir $AppDir -AppLabel $AppLabel
        Set-Location $Root
    }
}

# Execution
Set-Location $Root

if ($App -eq 'rider' -or $App -eq 'all') {
    Build-EasApp -AppDir "$Root\apps\rider-app" -AppLabel 'rider'
}
if ($App -eq 'driver' -or $App -eq 'all') {
    Build-EasApp -AppDir "$Root\apps\driver-app" -AppLabel 'driver'
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Builds soumis a EAS Cloud." -ForegroundColor Green
Write-Host "  Suivez la progression :" -ForegroundColor Green
Write-Host "  https://expo.dev/accounts/gbangou/projects" -ForegroundColor Green
Write-Host ""
Write-Host "  Une fois l APK pret :" -ForegroundColor Green
Write-Host "  adb install orbi-rider-mvp.apk" -ForegroundColor Green
Write-Host "  adb install orbi-driver-mvp.apk" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
