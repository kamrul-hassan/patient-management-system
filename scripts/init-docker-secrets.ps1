#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$secretDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.secrets'
if (Test-Path -LiteralPath $secretDirectory) {
    throw 'The .secrets directory already exists. Keep existing secrets with their database volume; this command never replaces them.'
}
New-Item -ItemType Directory -Path $secretDirectory | Out-Null
if ($IsWindows) {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $secretDirectory /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to the secret directory.' }
} else {
    [IO.File]::SetUnixFileMode($secretDirectory, [IO.UnixFileMode]::UserRead -bor [IO.UnixFileMode]::UserWrite -bor [IO.UnixFileMode]::UserExecute)
}
$values = @{}
foreach ($name in @('postgres_password', 'migration_password', 'application_password', 'api_key', 'session_secret', 'staff_password')) {
    $values[$name] = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
}
$values['migration_connection'] = 'Host=db;Port=5432;Database=careflow;Username=careflow_migrator;Password=' + $values['migration_password'] + ';SSL Mode=Disable'
$values['application_connection'] = 'Host=db;Port=5432;Database=careflow;Username=careflow_app;Password=' + $values['application_password'] + ';SSL Mode=Disable'
foreach ($entry in $values.GetEnumerator()) {
    $path = Join-Path $secretDirectory $entry.Key
    [IO.File]::WriteAllText($path, $entry.Value, [Text.UTF8Encoding]::new($false))
    if (!$IsWindows) {
        # The private parent protects host access; non-root containers must read the mounts.
        [IO.File]::SetUnixFileMode($path, [IO.UnixFileMode]::UserRead -bor [IO.UnixFileMode]::GroupRead -bor [IO.UnixFileMode]::OtherRead)
    }
}
Write-Output 'Created private Docker secret files without printing credentials. Existing native environment files and databases were not changed.'
Write-Output 'The generated staff password is stored in .secrets/staff_password. Keep it private.'
