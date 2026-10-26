param(
    [switch]$MigrateFromDocker,
    [switch]$ConfigureOnly,
    [string]$DatabaseName = 'careflow_local',
    [string]$DatabaseUser = 'careflow_local',
    [string]$AdminUser = 'postgres',
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
$workspace = $PSScriptRoot
$environmentPath = Join-Path $workspace '.env'
$metadataPath = Join-Path $workspace '.local/native-development.json'
$resultPath = Join-Path $workspace '.local/native-setup-result.json'
$backupPath = Join-Path $workspace '.local/backups/careflow-before-native-migration.dump'
$countsPath = Join-Path $workspace '.local/backups/careflow-before-native-migration.counts.json'
$projectPath = Join-Path $workspace 'apps/api/Careflow.Api.csproj'
foreach ($identifier in @($DatabaseName, $DatabaseUser, $AdminUser)) {
    if ($identifier -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$') { throw 'Use simple PostgreSQL identifiers (letters, digits, underscores).' }
}
$settings = @{}
foreach ($line in [System.IO.File]::ReadAllLines($environmentPath)) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
}
foreach ($name in @('API_KEY', 'SESSION_SECRET', 'STAFF_EMAIL', 'STAFF_PASSWORD', 'POSTGRES_PASSWORD')) {
    if (!$settings[$name] -or $settings[$name] -like 'replace-*') { throw "Configure $name in the root .env file first." }
}
$psql = Join-Path $PostgresBin 'psql.exe'
$pgRestore = Join-Path $PostgresBin 'pg_restore.exe'
if (!(Test-Path -LiteralPath $psql)) { throw 'PostgreSQL client tools were not found. Supply -PostgresBin with your PostgreSQL bin folder.' }
New-Item -ItemType Directory -Force (Join-Path $workspace '.local') | Out-Null
$existingMetadata = if (Test-Path -LiteralPath $metadataPath) { Get-Content -Raw $metadataPath | ConvertFrom-Json } else { $null }
$ownedDatabase = $existingMetadata -and $existingMetadata.DatabaseName -eq $DatabaseName -and $existingMetadata.DatabaseUser -eq $DatabaseUser -and $existingMetadata.DatabaseProvisioned
$nativeReady = $ownedDatabase -and $existingMetadata.State -eq 'Ready'
$previousPassword = $env:PGPASSWORD
$previousTimeout = $env:PGCONNECT_TIMEOUT
$env:PGCONNECT_TIMEOUT = '5'

function Invoke-LocalSql {
    param([string]$Sql, [string]$User = $AdminUser, [string]$Database = 'postgres')
    $output = $Sql | & $psql --host=127.0.0.1 --port=5432 --username=$User --dbname=$Database --no-password --tuples-only --no-align --quiet --set=ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'The local PostgreSQL command failed. No existing database was overwritten.' }
    return ($output -join "`n").Trim()
}

function Save-NativeMetadata {
    param([string]$State, [bool]$Provisioned)
    $metadata = @{
        Host = '127.0.0.1'; Port = 5432; DatabaseName = $DatabaseName; DatabaseUser = $DatabaseUser
        PostgresBin = $PostgresBin; State = $State; DatabaseProvisioned = $Provisioned
        UpdatedAtUtc = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText($metadataPath, $metadata, [System.Text.UTF8Encoding]::new($false))
}

function Set-NativeAppConfiguration {
    $connection = New-Object System.Data.Common.DbConnectionStringBuilder
    $connection['Host'] = '127.0.0.1'
    $connection['Port'] = '5432'
    $connection['Database'] = $DatabaseName
    $connection['Username'] = $DatabaseUser
    $connection['Password'] = $settings['POSTGRES_PASSWORD']
    $secrets = @{ ApiKey = $settings['API_KEY']; 'ConnectionStrings:Careflow' = $connection.ConnectionString } | ConvertTo-Json -Compress
    $secrets | & dotnet user-secrets set --project $projectPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not save the API development User Secrets.' }

    $webEnvironmentPath = Join-Path $workspace 'apps/web/.env.local'
    $content = if (Test-Path -LiteralPath $webEnvironmentPath) { [System.IO.File]::ReadAllText($webEnvironmentPath) } else { '' }
    $webSettings = @{
        API_URL = 'http://localhost:5050'; API_KEY = $settings['API_KEY']; SESSION_SECRET = $settings['SESSION_SECRET']
        STAFF_EMAIL = $settings['STAFF_EMAIL']; STAFF_PASSWORD = $settings['STAFF_PASSWORD']
        APP_ORIGIN = 'http://localhost:3000'; DEMO_MODE = 'false'; API_TIMEOUT_MS = '300000'
    }
    foreach ($name in $webSettings.Keys) {
        $settingLine = $name + '=' + $webSettings[$name]
        $pattern = '(?m)^[ \t]*' + [regex]::Escape($name) + '[ \t]*=[^\r\n]*'
        if ([regex]::IsMatch($content, $pattern)) {
            $content = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $settingLine })
        } else { $content = $content.TrimEnd("`r", "`n") + "`n" + $settingLine + "`n" }
    }
    [System.IO.File]::WriteAllText($webEnvironmentPath, $content, [System.Text.UTF8Encoding]::new($false))
}

try {
    if ($ConfigureOnly) {
        Set-NativeAppConfiguration
        if (!$nativeReady) { Save-NativeMetadata 'AwaitingDatabaseSetup' $false }
        Write-Host 'Native API User Secrets and apps/web/.env.local are configured. No credentials were printed.'
        Write-Host 'Database provisioning/migration still requires the local PostgreSQL administrator password.'
        return
    }

    if (!$nativeReady) {
        if ($MigrateFromDocker -and (!(Test-Path -LiteralPath $backupPath) -or !(Test-Path -LiteralPath $countsPath))) {
            throw 'The migration backup and baseline counts must be prepared before importing Docker data.'
        }
        Write-Host 'Enter the EXISTING password for your local PostgreSQL administrator.'
        Write-Host 'It is used only in this process and is not written to project files.'
        $securePassword = Read-Host -Prompt ("Local PostgreSQL password for " + $AdminUser) -AsSecureString
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
        $null = Invoke-LocalSql 'SELECT 1;'
        $databaseExists = (Invoke-LocalSql "SELECT count(*) FROM pg_database WHERE datname = '$DatabaseName';") -ne '0'
        $roleExists = (Invoke-LocalSql "SELECT count(*) FROM pg_roles WHERE rolname = '$DatabaseUser';") -ne '0'
        if ($databaseExists -and !$ownedDatabase) { throw "Database $DatabaseName already exists and is not marked as created by this helper. Use another -DatabaseName; nothing was overwritten." }
        if ($roleExists -and !$ownedDatabase) { throw "Role $DatabaseUser already exists and is not marked as created by this helper. Use another -DatabaseUser; its password was not changed." }
        if (!$roleExists) {
            $escapedPassword = $settings['POSTGRES_PASSWORD'].Replace("'", "''")
            $null = Invoke-LocalSql ('CREATE ROLE "' + $DatabaseUser + '" LOGIN PASSWORD ' + "'" + $escapedPassword + "';")
        }
        if (!$databaseExists) { $null = Invoke-LocalSql ('CREATE DATABASE "' + $DatabaseName + '" OWNER "' + $DatabaseUser + '";') }
        Save-NativeMetadata 'MigrationPending' $true

        $env:PGPASSWORD = $settings['POSTGRES_PASSWORD']
        if ($MigrateFromDocker) {
            $tableCount = Invoke-LocalSql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" $DatabaseUser $DatabaseName
            if ($tableCount -ne '0') { throw 'The target app database is not empty. Existing tables were left intact; choose a new database.' }
            Write-Host 'Restoring the backup into the dedicated local app database...'
            & $pgRestore --host=127.0.0.1 --port=5432 --username=$DatabaseUser --dbname=$DatabaseName --no-password --single-transaction --exit-on-error --no-owner --no-privileges $backupPath
            if ($LASTEXITCODE -ne 0) { throw 'Database restoration failed. The Docker data volume and backup remain available.' }
            $countsSql = @'
SELECT json_build_object(
 'locations', (SELECT count(*) FROM "Locations"),
 'patients', (SELECT count(*) FROM "Patients"),
 'appointments', (SELECT count(*) FROM "Appointments"),
 'invoices', (SELECT count(*) FROM "Invoices"),
 'records', (SELECT count(*) FROM "MedicalRecords"),
 'consents', (SELECT count(*) FROM "ConsentForms"),
 'messages', (SELECT count(*) FROM "Messages"),
 'trials', (SELECT count(*) FROM "Trials")
);
'@
            $restoredCounts = Invoke-LocalSql $countsSql $DatabaseUser $DatabaseName | ConvertFrom-Json
            $expectedCounts = Get-Content -Raw $countsPath | ConvertFrom-Json
            foreach ($property in $expectedCounts.PSObject.Properties) {
                if ($restoredCounts.($property.Name) -ne $property.Value) { throw ("Restore count mismatch: " + $property.Name) }
            }
            Write-Host 'Verified that all sample-data counts match the original Docker database.'
        }
    }

    $env:PGPASSWORD = $settings['POSTGRES_PASSWORD']
    $null = Invoke-LocalSql 'SELECT 1;' $DatabaseUser $DatabaseName
    Set-NativeAppConfiguration
    Save-NativeMetadata 'Ready' $true
    $result = @{ Success = $true; Host = '127.0.0.1'; Port = 5432; Database = $DatabaseName; User = $DatabaseUser; CompletedAtUtc = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
    [System.IO.File]::WriteAllText($resultPath, $result, [System.Text.UTF8Encoding]::new($false))
    Write-Host ''
    Write-Host 'Native setup is ready. Docker is not needed to run the API, web app, or database.'
    Write-Host 'Visual Studio: open Careflow.slnx, select Careflow.Api, and press F5.'
    Write-Host 'VS Code: open Careflow.Web.code-workspace, then run npm run dev in its terminal.'
    Write-Host 'Web: http://localhost:3000 | API / Swagger: http://localhost:5050/swagger'
    Write-Host 'API credentials are in User Secrets; web credentials are in ignored apps/web/.env.local.'
} catch {
    $result = @{ Success = $false; Message = $_.Exception.Message; CompletedAtUtc = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
    [System.IO.File]::WriteAllText($resultPath, $result, [System.Text.UTF8Encoding]::new($false))
    throw
} finally {
    $env:PGPASSWORD = $previousPassword
    $env:PGCONNECT_TIMEOUT = $previousTimeout
}
