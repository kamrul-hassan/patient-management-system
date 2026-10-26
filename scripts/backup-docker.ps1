#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
if (!$IsWindows) { throw 'This backup uses Windows DPAPI and must run as the Windows account that will restore it.' }
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
$backupRoot = Join-Path $workspace '.local/backups/automatic'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls $backupRoot /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict backup directory access.' }
$lock = [IO.File]::Open((Join-Path $backupRoot '.backup.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$connection = [System.Data.Common.DbConnectionStringBuilder]::new()
$connection.set_ConnectionString([IO.File]::ReadAllText((Join-Path $workspace '.secrets/application_connection')))
$database = [string]$connection.get_Item('Database')
if ($database -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { $lock.Dispose(); throw 'Invalid database name.' }
$connection.Clear()
$id = [Guid]::NewGuid().ToString('N')
$name = 'careflow-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + $id
$plaintextPath = Join-Path $backupRoot ($name + '.dump')
$encryptedPath = Join-Path $backupRoot ($name + '.dump.dpapi')
$containerPath = '/tmp/careflow-backup-' + $id + '.dump'
$testDatabase = 'careflow_backupcheck_' + $id
$createdTestDatabase = $false
$source = $null
$utf8 = [Text.UTF8Encoding]::new($false)
function Invoke-Docker {
    param([string[]]$Arguments, [string]$InputText = '')
    $info = [Diagnostics.ProcessStartInfo]::new('docker')
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    $process.Start() | Out-Null
    $output = $process.StandardOutput.ReadToEndAsync()
    $errors = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($InputText)
    $process.StandardInput.Close()
    if (!$process.WaitForExit(180000)) { $process.Kill($true); throw 'Docker backup operation timed out.' }
    $text = $output.GetAwaiter().GetResult()
    $errorText = $errors.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
        [IO.File]::WriteAllText((Join-Path $backupRoot ($name + '.error.log')), $errorText, $utf8)
        throw 'Docker backup operation failed; private diagnostics are in the backup directory.'
    }
    return $text.Trim()
}
function Database-Sql {
    param([string]$Target, [string]$Sql)
    Invoke-Docker @('compose','exec','-T','db','psql','--username=postgres',"--dbname=$Target",'--no-password','--quiet','--tuples-only','--no-align','--set=ON_ERROR_STOP=1') ("SET TIME ZONE 'UTC';`n" + $Sql)
}
function Snapshot-Sql {
    param([string]$Sql)
    $marker = 'END_' + [Guid]::NewGuid().ToString('N')
    $source.StandardInput.WriteLine($Sql + "`n\echo " + $marker)
    $source.StandardInput.Flush()
    $lines = [Collections.Generic.List[string]]::new()
    while ($true) {
        $task = $source.StandardOutput.ReadLineAsync()
        if (!$task.Wait(30000)) { throw 'Database snapshot operation timed out.' }
        $line = $task.GetAwaiter().GetResult()
        if ($null -eq $line) { throw 'Database snapshot connection ended unexpectedly.' }
        if ($line -eq $marker) { break }
        if ($line) { $lines.Add($line) }
    }
    return $lines.ToArray()
}
try {
    $info = [Diagnostics.ProcessStartInfo]::new('docker')
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in @('compose','exec','-T','db','psql','--username=postgres',"--dbname=$database",'--no-password','--quiet','--tuples-only','--no-align','--set=ON_ERROR_STOP=1')) { $info.ArgumentList.Add($argument) }
    $source = [Diagnostics.Process]::new()
    $source.StartInfo = $info
    $source.Start() | Out-Null
    $sourceErrors = $source.StandardError.ReadToEndAsync()
    $snapshot = @(Snapshot-Sql "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TIME ZONE 'UTC'; SELECT pg_export_snapshot();")[0]
    if ($snapshot -notmatch '^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$') { throw 'Invalid exported snapshot.' }
    $tables = @(Snapshot-Sql 'SELECT tablename FROM pg_tables WHERE schemaname=''public'' ORDER BY tablename COLLATE "C";')
    if (!$tables.Count) { throw 'The configured database has no application tables.' }
    $parts = foreach ($table in $tables) {
        if ($table -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'Unexpected table identifier.' }
        'SELECT ''' + $table + ''' AS name, count(*) AS rows, encode(sha256(convert_to(COALESCE(string_agg(row_to_json(t)::text, E''\n'' ORDER BY row_to_json(t)::text COLLATE "C"), ''''), ''UTF8'')), ''hex'') AS fingerprint FROM public."' + $table + '" t'
    }
    $manifestSql = 'SELECT * FROM (' + ($parts -join ' UNION ALL ') + ') x ORDER BY name COLLATE "C";'
    $manifest = @(Snapshot-Sql $manifestSql)
    Invoke-Docker @('compose','exec','-T','db','sh','-c',('umask 077; exec pg_dump --username=postgres --dbname=' + $database + ' --no-password --format=custom --no-owner --no-privileges --snapshot=' + $snapshot + ' --file=' + $containerPath)) | Out-Null
    Snapshot-Sql 'COMMIT;' | Out-Null
    $source.StandardInput.Close()
    $source.WaitForExit()
    if ($source.ExitCode -ne 0) { throw 'Snapshot transaction did not finish successfully.' }
    Invoke-Docker @('compose','cp',('db:' + $containerPath),$plaintextPath) | Out-Null
    $bytes = [IO.File]::ReadAllBytes($plaintextPath)
    $plaintextHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($encryptedPath, $encrypted)
    $roundtrip = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($encryptedPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($roundtrip)) -ne $plaintextHash) { throw 'Backup encryption verification failed.' }
    [Array]::Clear($bytes)
    [Array]::Clear($roundtrip)
    # Delete only the exact temporary plaintext file inside the private backup root.
    if (![IO.Path]::GetFullPath($plaintextPath).StartsWith([IO.Path]::GetFullPath($backupRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe temporary backup path.' }
    Remove-Item -LiteralPath $plaintextPath
    $toc = Invoke-Docker @('compose','exec','-T','db','pg_restore','--list',$containerPath)
    Database-Sql postgres ('CREATE DATABASE "' + $testDatabase + '" OWNER careflow_migrator TEMPLATE template0;') | Out-Null
    $createdTestDatabase = $true
    Database-Sql $testDatabase ('REVOKE ALL ON DATABASE "' + $testDatabase + '" FROM PUBLIC;') | Out-Null
    # pg_restore expects the standard public schema created by initdb.
    Invoke-Docker @('compose','exec','-T','db','pg_restore','--username=postgres',"--dbname=$testDatabase",'--no-password','--role=careflow_migrator','--no-owner','--no-privileges','--single-transaction','--exit-on-error',$containerPath) | Out-Null
    $restored = (Database-Sql $testDatabase $manifestSql) -split '\r?\n'
    if (@(Compare-Object $manifest $restored).Count) { throw 'Backup restore verification failed.' }
    $result = @{ Verified=$true; CreatedAtUtc=[DateTime]::UtcNow.ToString('o'); Database=$database; Tables=$tables.Count; Manifest=$manifest; PlaintextSHA256=$plaintextHash; EncryptedSHA256=(Get-FileHash -LiteralPath $encryptedPath -Algorithm SHA256).Hash; Encryption='Windows DPAPI CurrentUser'; Backup=$encryptedPath }
    $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupRoot ($name + '.json')) -Encoding utf8NoBOM
    $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupRoot 'latest.json') -Encoding utf8NoBOM
    Write-Output "PASS: encrypted local backup; restore and fingerprints verified for $($tables.Count) tables."
    Write-Output ('Backup: ' + $encryptedPath)
} finally {
    if ($source -and !$source.HasExited) {
        $source.StandardInput.WriteLine('ROLLBACK;')
        $source.StandardInput.Close()
        if (!$source.WaitForExit(5000)) { $source.Kill($true); $source.WaitForExit() }
    }
    if ($createdTestDatabase -and $testDatabase -match '^careflow_backupcheck_[a-f0-9]{32}$') {
        Database-Sql postgres ('DROP DATABASE "' + $testDatabase + '" WITH (FORCE);') | Out-Null
    }
    Invoke-Docker @('compose','exec','-T','db','rm','-f','--',$containerPath) | Out-Null
    if (Test-Path -LiteralPath $plaintextPath) {
        if ([IO.Path]::GetFullPath($plaintextPath).StartsWith([IO.Path]::GetFullPath($backupRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $plaintextPath }
    }
    $lock.Dispose()
}
