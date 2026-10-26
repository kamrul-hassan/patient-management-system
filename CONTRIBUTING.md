# Contributing to Careflow

## First run: isolated Docker demo

Install Git, PowerShell 7 (`pwsh`), and Docker Desktop configured for Linux containers, or Docker Engine with the Compose plugin. Start Docker, clone this repository, and run from its root:

```powershell
pwsh -NoProfile -File scripts/demo.ps1
```

Open **http://localhost:3100**. Sign in as `developer@example.com`; open `.local/demo/secrets/staff_password` privately in your editor for your generated password. Credentials are never printed. No .NET, Node.js, native PostgreSQL installation, existing `.env`, or database dump is needed for this Docker path.

The launcher builds the applications, initializes PostgreSQL, applies migrations using a dedicated schema owner, seeds twelve fictional patients and their sample records, and checks authenticated access. Clinic names begin with `[DEMO]`. Login remains required; this is a real PostgreSQL stack with synthetic data, not an authentication bypass.

Each checkout uses a stable `careflow-demo-<checkout-id>` Compose project derived from its directory path, its own project-scoped database volume, demo-specific image tags, and newly generated secrets in `.local/demo/secrets/`. A fresh clone does not collide with another checkout's database or require its credentials. The default `careflow` stack, native database, root `.env`, `.secrets/`, and backups are not reused. Inherited Compose project/file settings are cleared for demo commands, and resolved secret paths are checked before startup.

Re-running the command reuses demo credentials and data; it does not reset the database or duplicate seed records. If port 3100 is occupied, use `-Port 3200`. Keep using that port when restarting the demo. The main application's standard port 3000 is deliberately excluded.

```powershell
pwsh -NoProfile -File scripts/demo.ps1 -Action Status
pwsh -NoProfile -File scripts/demo.ps1 -Action Stop
```

Stopping retains demo data and secrets. Run Start/Stop/Status from the same checkout path; moving a checkout changes its project identity and leaves its previous containers and volume untouched. The launcher has no reset/delete command. If this checkout's demo volume exists but its secrets are missing, it stops and asks you to recover them instead of generating mismatched passwords. Do not delete your main stack's volume or private files to repair a demo.

## Architecture and security boundaries

- `apps/web`: Next.js/React interface, staff sessions, same-origin request checks, and a server-side API proxy. API keys and secret-file readers stay server-only.
- `apps/api`: ASP.NET Core endpoints, validation, API-key authentication, and EF Core persistence. Swagger is available only in Development.
- `db`: PostgreSQL on an internal Docker network. No database or API port is published to the host.
- `migrate`: one-shot migration job with schema ownership. The running API gets only data access through a separate database role.

Use synthetic data throughout development and automated testing. Never request another developer's database, credentials, backup, or Windows DPAPI keys. Do not add secrets to `NEXT_PUBLIC_*`, Docker build arguments, screenshots, logs, issues, or pull requests. Read [SECURITY.md](SECURITY.md) before changing authentication, authorization, networking, secret handling, or database permissions.

The single configured staff account is a starter limitation. The demo is local-only; do not publish it as a patient service. Real patient deployments require the additional controls described in `SECURITY.md`.

## Working on changes

Create a focused branch from an up-to-date `main` and open a pull request. Explain the problem, resulting behavior, validation, and any database migration or deployment implications. Include screenshots only when they contain synthetic data and no credentials. Wait for the GitHub `verify` and `docker` checks to pass before merging. Review Dependabot pull requests through the same process.

Follow existing code conventions: nullable C#, warnings as errors, strict TypeScript, and Prettier formatting for the web project. Avoid unrelated formatting or generated build output. Commit manifest and lockfile updates together. Image digests and GitHub Actions commit pins should be updated through reviewed changes.

To run development tools outside Docker, install .NET SDK 10, Node.js 24, and npm 11. Restore and verify:

```powershell
dotnet restore Careflow.slnx --locked-mode
npm ci --prefix apps/web
dotnet build Careflow.slnx
npm run build --prefix apps/web
npm run typecheck --prefix apps/web
npm run format:check --prefix apps/web
dotnet run --project tests/ConfigurationChecks --configuration Release
pwsh -NoProfile -File scripts/check-publish.ps1
```

After editing code, run the demo launcher again to rebuild and restart only its services. Native debugging and the separate empty-database Docker setup are documented in [README.md](README.md).

## Database changes and tests

Commit EF migrations and their model snapshot with model changes. Configure a dedicated development connection through .NET User Secrets or a private environment variable, restore the EF tool, and generate a migration:

```powershell
dotnet tool restore
dotnet ef migrations add DescribeChange --project apps/api
```

Review the migration for destructive changes. Test it on a disposable database with synthetic fixtures, including the upgrade path where appropriate. Production migrations run separately from the API and require a backup/recovery plan; do not grant schema ownership to the runtime role or edit an applied migration to change its meaning.

`tests/api.integration.mjs` and `tests/docker.integration.mjs` create records. Run them only in isolated `careflow-ci` or `careflow-test-*` projects, following the README. `tests/docker.smoke.mjs` performs read-only app/database checks against the main local stack. Windows-only manual backup testing uses DPAPI and is not a Linux CI step.

Before committing, review `git status`, `git diff --cached`, and the publication check. Only placeholder environment templates belong in Git. `.local/`, `.secrets/`, database archives, encrypted backups, and private keys must remain ignored. The private native setup/migration helpers are intentionally not distributed with the repository.
