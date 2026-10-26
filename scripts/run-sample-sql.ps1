param([Parameter(Mandatory = $true)][ValidateSet('Messages', 'History')][string]$Dataset)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $workspace '.local/native-development.json'
if (!(Test-Path -LiteralPath $configPath)) { throw 'Run configure-local.ps1 first.' }
$config = Get-Content -Raw $configPath | ConvertFrom-Json
if ($config.State -ne 'Ready') { throw 'Complete the native database setup first.' }
$settings = @{}
foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $workspace '.env'))) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
}
$sqlPath = Join-Path $PSScriptRoot ('seed-sample-' + $Dataset.ToLowerInvariant() + '.sql')
$psql = Join-Path $config.PostgresBin 'psql.exe'
$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $settings['POSTGRES_PASSWORD']
    Get-Content -Raw $sqlPath | & $psql --host=$($config.Host) --port=$($config.Port) --username=$($config.DatabaseUser) --dbname=$($config.DatabaseName) --no-password --set=ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'Sample-data import failed.' }
} finally { $env:PGPASSWORD = $previousPassword }
