#Requires -Version 7.0
param(
    [ValidateSet('Start','Stop','Status')][string]$Action = 'Start',
    [ValidateRange(1024,65535)][int]$Port = 3100
)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$identityPath = [IO.Path]::GetFullPath($workspace).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
if ($IsWindows) { $identityPath = $identityPath.ToLowerInvariant() }
$checkoutId = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($identityPath))).Substring(0,12).ToLowerInvariant()
$projectName = 'careflow-demo-' + $checkoutId
Push-Location -LiteralPath $workspace
try {
    if ($Port -in @(3000,5050,5432)) { throw 'Choose a demo port other than the standard app/API/database ports (default: 3100).' }
    $demoDirectory = Join-Path $workspace '.local/demo'
    New-Item -ItemType Directory -Path $demoDirectory -Force | Out-Null
    $envFile = Join-Path $demoDirectory 'compose.env'
    # An explicit env file excludes the developer's root .env. Environment values
    # are also set on each child process to defeat inherited Compose overrides.
    if (!(Test-Path -LiteralPath $envFile)) { [IO.File]::WriteAllText($envFile, "# Demo-only non-secret settings.`n") }
    $composeArguments = @('compose','--project-name',$projectName,'--project-directory',$workspace,'--env-file',$envFile,'--file','compose.yml','--file','compose.demo.yml')
    function Invoke-DemoDocker {
        param([string[]]$Arguments, [string]$InputText = '', [switch]$Capture, [switch]$RawDocker)
        $info = [Diagnostics.ProcessStartInfo]::new('docker')
        $info.UseShellExecute = $false
        $info.RedirectStandardInput = $true
        $info.RedirectStandardOutput = [bool]$Capture
        foreach ($key in @($info.Environment.Keys | Where-Object { $_ -like 'COMPOSE_*' })) { $info.Environment.Remove($key) | Out-Null }
        $info.Environment['CAREFLOW_SECRETS_DIR'] = './.local/demo/secrets'
        $info.Environment['STAFF_EMAIL'] = 'developer@example.com'
        $info.Environment['APP_ORIGIN'] = "http://localhost:$Port"
        $info.Environment['WEB_PORT'] = [string]$Port
        if (!$RawDocker) { foreach ($argument in $composeArguments) { $info.ArgumentList.Add($argument) } }
        foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
        $process = [Diagnostics.Process]::new()
        $process.StartInfo = $info
        $process.Start() | Out-Null
        $output = if ($Capture) { $process.StandardOutput.ReadToEndAsync() } else { $null }
        $process.StandardInput.Write($InputText)
        $process.StandardInput.Close()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw 'Demo Docker command failed. Existing app services and data have not been targeted.' }
        if ($Capture) { return $output.GetAwaiter().GetResult().Trim() }
    }
    if ($Action -eq 'Stop') { Invoke-DemoDocker @('stop'); return }
    if ($Action -eq 'Status') { Invoke-DemoDocker @('ps','--all'); return }
    Invoke-DemoDocker @('info','--format','{{.ServerVersion}}') -RawDocker -Capture | Out-Null
    $secretDirectory = Join-Path $demoDirectory 'secrets'
    if (!(Test-Path -LiteralPath $secretDirectory)) {
        $existingVolume = Invoke-DemoDocker @('volume','ls','--filter',("name=^${projectName}_postgres_data$"),'--format','{{.Name}}') -RawDocker -Capture
        if ($existingVolume) { throw 'Demo volume exists but its secrets are missing. Recover the demo secrets; this launcher never resets a database or replaces its passwords.' }
        & (Join-Path $PSScriptRoot 'init-docker-secrets.ps1') -RelativeDirectory '.local/demo/secrets'
    }
    foreach ($name in @('postgres_password','migration_password','application_password','api_key','session_secret','staff_password','migration_connection','application_connection')) {
        if (!(Test-Path -LiteralPath (Join-Path $secretDirectory $name) -PathType Leaf)) { throw 'Demo secret set is incomplete; no existing credentials will be replaced.' }
    }
    $config = (Invoke-DemoDocker @('config','--format','json') -Capture) | ConvertFrom-Json
    if ($config.name -ne $projectName -or $config.volumes.postgres_data.name -ne "${projectName}_postgres_data") { throw 'Unexpected demo project or volume.' }
    foreach ($secret in $config.secrets.PSObject.Properties) {
        $path = [IO.Path]::GetFullPath($secret.Value.file)
        if (![string]::Equals([IO.Path]::GetDirectoryName($path), [IO.Path]::GetFullPath($secretDirectory), [StringComparison]::OrdinalIgnoreCase)) { throw 'Demo attempted to use a non-demo secret file.' }
    }
    Invoke-DemoDocker @('up','--build','--detach')
    $check = @'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const origin=process.env.APP_ORIGIN;
const base='http://127.0.0.1:3000';
let ready=false;
for(let i=0;i<60;i++) {
  try { if((await fetch(base)).ok && (await fetch('http://api:8080/health')).ok) { ready=true; break; } } catch {}
  await new Promise(r=>setTimeout(r,1000));
}
assert.ok(ready,'Demo did not become ready');
assert.equal((await fetch(base+'/api/workspace')).status,401);
const response=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:process.env.STAFF_EMAIL,password:readFileSync('/run/secrets/staff_password','utf8').trim()})});
assert.equal(response.status,200,'Demo login failed');
const session=response.headers.get('set-cookie');
assert.match(session,/HttpOnly/i); assert.match(session,/Secure/i);
const workspace=await fetch(base+'/api/workspace',{headers:{Cookie:session.split(';')[0]}});
assert.equal(workspace.status,200);
const data=await workspace.json();
assert.ok(data.patients.length>=12,'Expected synthetic demo patients');
assert.ok(data.locations.some(l=>l.name.startsWith('[DEMO]')));
await fetch(base+'/api/auth',{method:'DELETE',headers:{Origin:origin}});
console.log('PASS: authenticated PostgreSQL demo with synthetic data and secure cookies.');
'@
    Invoke-DemoDocker @('exec','-T','web','node','--input-type=module') $check
    Write-Output "Demo ready: http://localhost:$Port | Staff email: developer@example.com"
    Write-Output "Checkout-specific Docker project: $projectName"
    Write-Output 'Read the generated password privately from .local/demo/secrets/staff_password. No password has been printed.'
    Write-Output 'Stop only this demo: pwsh -NoProfile -File scripts/demo.ps1 -Action Stop'
} finally {
    Pop-Location
}
