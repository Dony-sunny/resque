param(
    [string]$BindAddress = '127.0.0.1',
    [int]$Port = 8000,
    [string]$DatabasePath,
    [string]$TlsCertificate,
    [string]$TlsPrivateKey,
    [switch]$Seed
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$venvPython = Join-Path $backendRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    throw 'Backend dependencies are not installed. Follow backend/README.md to create backend/.venv first.'
}
if (-not $DatabasePath) { $DatabasePath = Join-Path $backendRoot 'data/resq-relay.db' }
$databaseFile = [System.IO.Path]::GetFullPath($DatabasePath)
New-Item -ItemType Directory -Path (Split-Path -Parent $databaseFile) -Force | Out-Null
if (-not $env:RESQ_DEMO_ACCESS_KEY) {
    throw 'Set RESQ_DEMO_ACCESS_KEY to a fresh random key; enter the same key in mobile Settings on all demo phones.'
}
if ([bool]$TlsCertificate -ne [bool]$TlsPrivateKey) {
    throw 'Provide both -TlsCertificate and -TlsPrivateKey for HTTPS.'
}
$tlsArguments = @()
$protocol = 'http'
if ($TlsCertificate) {
    $certificateFile = (Resolve-Path -LiteralPath $TlsCertificate).Path
    $privateKeyFile = (Resolve-Path -LiteralPath $TlsPrivateKey).Path
    $tlsArguments = @('--ssl-certfile', $certificateFile, '--ssl-keyfile', $privateKeyFile)
    $protocol = 'https'
}
$oldDatabaseUrl = $env:DATABASE_URL
$oldDemoMode = $env:RESQ_DEMO_MODE
try {
    $env:DATABASE_URL = 'sqlite:///' + $databaseFile.Replace('\','/')
    $env:RESQ_DEMO_MODE = 'true'
    Push-Location -LiteralPath $backendRoot
    try {
        if ($Seed) {
            & $venvPython -m app.seed
            if ($LASTEXITCODE -ne 0) { throw 'Seed failed; server was not started.' }
        }
        Write-Host ('Persistent database: ' + $databaseFile)
        Write-Host ('Health: ' + $protocol + '://' + $BindAddress + ':' + $Port + '/health')
        Write-Host 'Use trusted HTTPS for the standalone APK. Demo key is not printed.'
        & $venvPython -m uvicorn app.main:app --host $BindAddress --port $Port @tlsArguments
    } finally { Pop-Location }
} finally {
    $env:DATABASE_URL = $oldDatabaseUrl
    $env:RESQ_DEMO_MODE = $oldDemoMode
}
