$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    $files = @(& git -c core.quotepath=false ls-files --cached --others --exclude-standard)
    if ($LASTEXITCODE -ne 0) { throw 'Run this check inside the initialized project Git repository.' }
    $files = @($files | Sort-Object -Unique)
    $tracked = @(& git -c core.quotepath=false ls-files --cached)
    $localSecrets = @()
    foreach ($localPath in @('.env', 'apps/web/.env.local')) {
        if (Test-Path -LiteralPath $localPath) {
            foreach ($line in [IO.File]::ReadAllLines((Join-Path $PWD $localPath))) {
                if ($line -match '^(POSTGRES_PASSWORD|API_KEY|SESSION_SECRET|STAFF_PASSWORD)=(.+)$') {
                    $value = $matches[2].Trim().Trim('"').Trim("'")
                    if ($value -and !$value.StartsWith('replace-')) { $localSecrets += $value }
                }
            }
        }
    }
    if (Test-Path -LiteralPath '.secrets') {
        foreach ($secretFile in Get-ChildItem -LiteralPath '.secrets' -File) {
            $value = [IO.File]::ReadAllText($secretFile.FullName).Trim()
            if ($value) { $localSecrets += $value }
        }
    }
    $failures = @()
    foreach ($file in $files) {
        $template = $file -match '(^|/)\.env(?:\.[^/]+)?\.example$'
        $seed = $file -in @('scripts/seed-sample-history.sql', 'scripts/seed-sample-messages.sql')
        $blocked = $file -match '(^|/)(\.local|\.secrets|backups?|pgdata)/' -or
            $file -eq 'configure-local.ps1' -or
            (!$template -and $file -match '(^|/)\.env(?:\.[^/]*)?$') -or
            $file -match '(^|/)(secrets\.json|\.pgpass|pgpass\.conf|\.pg_service\.conf|\.envrc|appsettings\.(?:.*\.)?local\.json)$' -or
            $file -match '\.(dump|backup|bak|pem|key|p12|pfx|zip|tar|tgz|gz|bz2|xz|db(?:-.*)?|sqlite3?(?:-.*)?|mdf|ldf|pgdata)$' -or
            (!$seed -and $file -match '\.sql$')
        if ($blocked) { $failures += "$file (sensitive file type/path)"; continue }
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) { continue }
        $content = [IO.File]::ReadAllText((Join-Path $PWD $file))
        # Also scan the index: an older staged version can contain secrets even
        # after the working copy has been cleaned up.
        if ($file -in $tracked -and $file -notmatch '\.(png|jpg|jpeg|gif|ico|woff2?)$') {
            $indexContent = @(& git show ":$file" 2>$null)
            if ($LASTEXITCODE -ne 0) { throw 'Could not inspect staged content.' }
            $content += "`n" + ($indexContent -join "`n")
        }
        foreach ($secret in $localSecrets) {
            if ($content.Contains($secret)) { $failures += "$file (configured local secret)"; break }
        }
        if ($content -match '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----' -or
            $content -match '\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b') {
            $failures += "$file (credential pattern)"
        }
    }
    if ($failures.Count) {
        $failures | Sort-Object -Unique | ForEach-Object { Write-Output $_ }
        throw 'Publication check failed. Remove sensitive files from Git and remove secrets before publishing.'
    }
    Write-Output "Publication check passed: $($files.Count) candidate files; no configured local secrets, blocked paths, or recognized credential patterns found."
} finally {
    Pop-Location
}
