param(
    [switch]$InstallToFireTv = $false,
    [string]$FireTvIp = $env:FIRETV_IP
)

$ErrorActionPreference = 'Stop'
$IptvRoot = $PSScriptRoot

# 1. Sync latest Web UI assets into Android APK assets
Write-Host "==> Sincronizando interface KS TV-Stream (public -> android-firetv/assets/www)..." -ForegroundColor Cyan
Copy-Item -Path "$IptvRoot\public\*" -Destination "$IptvRoot\android-firetv\app\src\main\assets\www\" -Recurse -Force

# 2. Configure Java & Android SDK environment dynamically
$SiblingTools = [System.IO.Path]::GetFullPath((Join-Path $IptvRoot "..\..\..\AURORA-TV"))
if (-not $env:JAVA_HOME -and (Test-Path "$SiblingTools\tools\java")) {
    $jdkDir = Get-ChildItem -Path "$SiblingTools\tools\java" -Directory | Select-Object -First 1
    if ($jdkDir) { $env:JAVA_HOME = $jdkDir.FullName }
}
if (-not $env:ANDROID_HOME -and (Test-Path "$SiblingTools\tools\android-sdk")) {
    $env:ANDROID_HOME = "$SiblingTools\tools\android-sdk"
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
}
if (-not $env:GRADLE_USER_HOME -and (Test-Path "$SiblingTools\.gradle-home")) {
    $env:GRADLE_USER_HOME = "$SiblingTools\.gradle-home"
}
if (-not $env:ANDROID_USER_HOME -and (Test-Path "$SiblingTools\tools\android-user")) {
    $env:ANDROID_USER_HOME = "$SiblingTools\tools\android-user"
}

$processPath = ($env:PATH -split ';' | ForEach-Object { $_.Trim().Replace('"','') } | Where-Object { $_ }) -join ';'
if ($env:JAVA_HOME -and $env:ANDROID_HOME) {
    $env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$processPath"
}

# 3. Build APK
Push-Location "$IptvRoot\android-firetv"
try {
    Write-Host "==> Compilando APK KS TV-Stream para Fire TV Stick 4K..." -ForegroundColor Cyan
    & .\gradlew.bat assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao compilar o APK (código $LASTEXITCODE)."
    }
} finally {
    Pop-Location
}

$BuiltApk = "$IptvRoot\android-firetv\app\build\outputs\apk\debug\app-debug.apk"
$DistApk = "$IptvRoot\dist\KS-TV-Stream.apk"
New-Item -ItemType Directory -Force -Path "$IptvRoot\dist" | Out-Null
Copy-Item -Path $BuiltApk -Destination $DistApk -Force
Write-Host "==> APK gerado com sucesso em: $DistApk" -ForegroundColor Green

# 4. Optional Install & Launch on Fire TV Stick 4K via ADB
if ($InstallToFireTv) {
    $Adb = if ($env:ANDROID_HOME -and (Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe")) {
        "$env:ANDROID_HOME\platform-tools\adb.exe"
    } else {
        "adb"
    }
    if ($FireTvIp) {
        Write-Host "==> Conectando via ADB ($FireTvIp)..." -ForegroundColor Cyan
        & $Adb connect $FireTvIp | Out-Host
        & $Adb -s $FireTvIp install -r $DistApk | Out-Host
        & $Adb -s $FireTvIp shell am start -n "com.appletv.iptv.firetv/.MainActivity" | Out-Host
    } else {
        Write-Host "==> Instalando no dispositivo ADB conectado..." -ForegroundColor Cyan
        & $Adb install -r $DistApk | Out-Host
        & $Adb shell am start -n "com.appletv.iptv.firetv/.MainActivity" | Out-Host
    }
}
