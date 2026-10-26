# Careflow

Patient management built with ASP.NET Core 10, Next.js, React, TypeScript, Entity Framework Core, and PostgreSQL 18. See the package manifests and lockfiles for exact dependencies.

## Docker setup

Install Docker Desktop with Linux containers (or Docker Engine with Compose), PowerShell 7, and Git. The native PostgreSQL service is not needed by Docker. Your existing native environment files, database, and ignored `configure-local.ps1` remain local and are not used to provision Docker.

Generate Docker-only secrets once:

```powershell
pwsh -NoProfile -File scripts/init-docker-secrets.ps1
```

The script generates distinct random credentials in `.secrets/`, restricts host directory access, and never prints their values. It refuses to replace an existing directory. Keep those files with the database volume; regenerating them does not change passwords already stored in PostgreSQL. Local Compose secrets are file mounts, not an encrypted vault.

Choose non-secret settings through your shell or an optional ignored root `.env`:

```dotenv
STAFF_EMAIL=admin@example.com
APP_ORIGIN=http://localhost:3000
WEB_PORT=3000
```

For a public deployment, use your actual HTTPS origin and put an HTTPS reverse proxy in front of the loopback web port. The local HTTP exception applies only to localhost. Cookies remain Secure in production, so use `localhost` for local browser access and HTTPS for deployment.

Start the stack:

```powershell
docker compose config --quiet
docker compose up --build --detach
docker compose ps --all
```

Open **http://localhost:3000** and sign in with the configured `STAFF_EMAIL` (default `admin@careflow.local`) and the password in the private `.secrets/staff_password` file. Read that file privately in your editor; never paste it into issues, chat, screenshots, or source files.

A new Docker database starts empty. No patient records or native database backups are automatically imported.

## Container and database boundaries

- `db` initializes PostgreSQL and two non-administrator logins on a new volume.
- `migrate` applies EF migrations with the schema owner and exits before `api` starts.
- `api` uses a separate login that can read/write application data but cannot create schema objects or administer PostgreSQL. It does not apply migrations at production startup.
- `web` mounts only its API key, session key, and staff password. It connects to the API server-side.

API/web containers run as non-root users with read-only filesystems, dropped capabilities, and no privilege escalation. Database and API ports are not published. The database network is internal. Only the web port binds to `127.0.0.1`.

Plain database transport is explicitly allowed for the isolated single-host Docker network. For a managed or remote PostgreSQL server, remove `Database__AllowUnencryptedConnection`, use a connection with `SSL Mode=VerifyFull`, configure its trusted certificate, and preserve private connectivity. The API rejects missing passwords, administrator runtime logins, and sensitive database logging settings in production.

Keep the mounted `.secrets/` directory and backups outside your Git history and image build contexts. See [SECURITY.md](SECURITY.md) for deployment requirements and incident response.

## Updating and stopping Docker

For an update, first back up the database and review/test schema changes, then run:

```powershell
docker compose build
docker compose stop api web
docker compose run --rm migrate
docker compose up --detach
```

Stop services without deleting data:

```powershell
docker compose stop
```

`docker compose down` removes containers and networks while retaining the named database volume. Do not use `--volumes`/`-v` on data you need. The role initializer runs only on a new volume; an older volume needs a planned role/permissions migration. Do not delete an existing volume to apply these settings.

## Manual local backups

On Windows, run an on-demand backup with the same account that runs this project:

```powershell
pwsh -NoProfile -File scripts/backup-docker.ps1
```

The command reads the current database name from the private connection file. It takes a consistent snapshot without changing the app database, encrypts the archive using Windows DPAPI for the current account, and verifies a restore in a separate temporary database using table counts and SHA-256 fingerprints. The temporary database and plaintext files are removed afterward. Backups and verification metadata stay under the restricted, Git-ignored `.local/backups/automatic/` folder. A `latest.json` with `Verified: true` identifies the most recent successful backup. No schedule or automatic deletion is configured.

DPAPI backups require the same Windows account and its encryption keys to decrypt. Keep that Windows profile recoverable; these local backups do not provide off-device disaster recovery. Request a restore into a separate database before switching an application to recovered data.

## Native development

Docker is the reproducible setup for a fresh clone. Native development remains available with .NET 10, Node.js 24, PowerShell 7, and PostgreSQL. The existing private setup helper is deliberately not included in Git.

Store API configuration through **Manage User Secrets** in Visual Studio or `dotnet user-secrets`. Supply `ApiKey` and `ConnectionStrings:Careflow`; use a dedicated development database login. Do not write credentials into `appsettings.json` or `launchSettings.json`.

Copy `apps/web/.env.example` to the ignored `apps/web/.env.local` and configure the matching server API key, a distinct session secret, staff credentials, API URL, and browser origin. Example values must be replaced. Never use `NEXT_PUBLIC_*` for secrets.

```powershell
dotnet tool restore
dotnet restore Careflow.slnx --locked-mode
npm ci --prefix apps/web
dotnet run --project apps/api --launch-profile Careflow.Api
# In a separate terminal:
npm run dev --prefix apps/web
```

The development API listens on `http://localhost:5050`; its development-only Swagger UI is at `/swagger`. Select **Authorize** and provide the private API key to test clinic endpoints. Swagger does not embed the key or persist authorization. Native Development applies EF migrations on startup; production uses the separate migration job.

## Verification and GitHub

```powershell
pwsh -NoProfile -File scripts/check-publish.ps1
dotnet build Careflow.slnx
npm run build --prefix apps/web
npm run typecheck --prefix apps/web
npm run format:check --prefix apps/web
```

The publication check inspects working files and staged text, blocks private configuration/backup paths, and compares content with local native and Docker secrets. It reports filenames only. It is not a complete secret scanner; review all new files and screenshots before publishing.

GitHub CI uses read-only repository permissions and commit-pinned actions. It scans full Git history with a checksum-pinned Gitleaks release, checks publication rules and dependency advisories, builds both applications, and tests a disposable Docker stack. Dependabot proposes npm, NuGet, image, Compose, and Actions updates for review. Image digests and dependency lockfiles keep reviewed builds reproducible; review and merge their updates regularly.

The Docker test suite creates synthetic data. It requires a `COMPOSE_PROJECT_NAME` of `careflow-ci` or `careflow-test-*`, a separate volume, and a free port. Never run mutating integration tests against a working patient database. CI removes only its own disposable volume.

```powershell
$env:COMPOSE_PROJECT_NAME = 'careflow-test-local'
$env:WEB_PORT = '3100'
$env:APP_ORIGIN = 'http://localhost:3100'
docker compose up --build --detach
node tests/docker.integration.mjs
```

## Features and current limits

The application includes appointments, synthetic patient charts and records, invoices, consent acknowledgments, analytics, and local camera/microphone checks. Demo seed scripts contain fictional data; database dumps are not included. Some native sample helpers require private local setup metadata.

This is a single-staff-account starter. Location filters are not authorization boundaries. Live patient calls, patient portal identities, outbound email/SMS, card processing, and verified electronic signatures are not connected. Before using real patient data, add individual identities/MFA, role and location authorization, audit history, session revocation, distributed rate limiting, encrypted backups with tested recovery, monitoring, and a deployment-specific privacy/security assessment.
