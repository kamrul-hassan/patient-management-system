$ErrorActionPreference = 'Stop'
$workspace = $PSScriptRoot
$random = New-Object byte[] 32
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($random)
$generator.Dispose()
$demoKey = [BitConverter]::ToString($random).Replace('-', '')
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:Database__Provider = 'InMemory'
$env:SeedDemoData = 'true'
$env:ApiKey = $demoKey
$env:API_KEY = $demoKey
$env:API_URL = 'http://127.0.0.1:5050'
$env:DEMO_MODE = 'true'

if (!(Test-Path -LiteralPath (Join-Path $workspace 'apps/web/node_modules'))) {
    throw 'Run npm ci --prefix apps/web before starting the demo.'
}

dotnet build (Join-Path $workspace 'apps/api/Careflow.Api.csproj') --nologo
if ($LASTEXITCODE -ne 0) { throw 'The API build failed.' }
$apiDirectory = Join-Path $workspace 'apps/api'
$apiAssembly = Join-Path $apiDirectory 'bin/Debug/net10.0/Careflow.Api.dll'
$apiProcess = Start-Process -FilePath 'dotnet' -ArgumentList @(('"' + $apiAssembly + '"'), '--urls', 'http://127.0.0.1:5050') -WorkingDirectory $apiDirectory -PassThru -WindowStyle Hidden
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($apiProcess.HasExited) { throw 'The API exited. Run dotnet build apps/api to check the build.' }
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5050/health'
            if ($health.status -eq 'healthy') { $ready = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (!$ready) { throw 'The API did not become ready on port 5050.' }
    Write-Host 'Careflow demo is ready. Open http://localhost:3000. Press Ctrl+C to stop.'
    Push-Location (Join-Path $workspace 'apps/web')
    try { npm run dev } finally { Pop-Location }
} finally {
    if (!$apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id }
}
