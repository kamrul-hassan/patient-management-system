# Careflow

Patient management built with ASP.NET Core 10, Next.js 16.4.3 / React 19.3.1, TypeScript, Entity Framework Core 10, and PostgreSQL 18.

The normal development setup runs all three services directly on Windows:

- **API:** Visual Studio, using F5.
- **Web:** VS Code, using its terminal or frontend debugger.
- **Database:** the installed local PostgreSQL service on port 5432.

Docker is not needed for native development. The old hybrid Docker debug override and launcher have been removed. The base Docker deployment files are optional deployment artifacts; they do not participate in the steps below.

## One-time native setup

Requires .NET SDK 10, Node.js 24 LTS, PostgreSQL 18, Visual Studio with .NET 10 support, and VS Code.

For a fresh clone, copy `.env.example` to `.env` and replace every placeholder locally. Use distinct random values of at least 32 characters for `API_KEY` and `SESSION_SECRET`, a strong database password, and your own staff credentials. Do not commit the populated file.

```powershell
Copy-Item .env.example .env
# Edit .env before continuing.
.\configure-local.ps1
```

This creates a new empty local database. EF migrations apply when the API starts. Native setup copies the API configuration into .NET User Secrets and web configuration into the ignored `apps/web/.env.local` file. Secrets are not printed.

For an existing local installation only, if you have prepared a backup and baseline counts under `.local/backups`, you can restore them with the following command. Backups and local setup metadata are excluded from Git and are not supplied in a clone:

```powershell
.\configure-local.ps1 -MigrateFromDocker
```

Despite the migration switch name, restoration reads the prepared local backup and does not need running Docker containers. Enter your **existing local PostgreSQL administrator password** at the private PowerShell prompt. This is separate from the app password in `.env`.

The helper creates a dedicated **careflow_local** login and database on `127.0.0.1:5432`, restores the backup in a transaction, and verifies every sample-data count. It does not overwrite unrelated databases or change existing PostgreSQL users' passwords. If those names already belong to another database/user, choose alternatives:

```powershell
.\configure-local.ps1 -MigrateFromDocker -DatabaseName careflow_local_test -DatabaseUser careflow_local_test
```

The default PostgreSQL tools path is `C:\Program Files\PostgreSQL\18\bin`; use `-PostgresBin` if yours differs. The helper stores non-secret setup metadata in `.local/native-development.json`. Re-running after a successful migration refreshes app configuration without restoring over later edits.

For a new empty database, omit `-MigrateFromDocker`.

## Publishing source to GitHub

Run the local publication check before committing or pushing:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-publish.ps1
git status --short
git diff --cached --stat
```

The check examines tracked files and unignored new files, rejects secret/backup paths, and looks for configured local secret values and common credential formats. It reports file names only. It is a guard against accidental publication, not a complete secret scanner. Review new content, including screenshots, for private data. The included screenshots and seed scripts use demo data.

Keep real credentials in ignored local environment files or a deployment secret store. Commit only placeholder environment templates. Do not force-add ignored files. SQL files are ignored except the two reviewed synthetic seed scripts. Database dumps, archives, local databases, and private keys are also ignored. If a credential has already been published, rotate it and remove it from repository history.

## Run the API in Visual Studio

1. Open **Careflow.slnx**.
2. Set **Careflow.Api** as the startup project.
3. Select the **Careflow.Api** launch profile.
4. Press **F5**.

The API listens on **http://localhost:5050**, uses the local PostgreSQL database, and opens **Swagger UI** at **http://localhost:5050/swagger**. Credentials are loaded from **Careflow.Api → Manage User Secrets**. Do not place passwords in `launchSettings.json`.

To run the same API from a terminal instead:

```powershell
dotnet run --project apps/api --launch-profile Careflow.Api
```

Use either the terminal or Visual Studio for the API, so two processes do not compete for port 5050.

### Test endpoints in Swagger

Click **Authorize** and paste the **ApiKey** value from Manage User Secrets (the same value as root `.env` → `API_KEY`). Enter the raw key without a `Bearer` prefix.

Start with **Workspace → GET /api/workspace → Try it out → Execute**. Copy returned patient IDs, location IDs, and provider names into other requests. Endpoints are grouped by feature, and request/response schemas are provided.

Swagger is enabled only in Development. It does not embed your API key or retain authorization across page refreshes. The health endpoint is public; clinic endpoints still require `X-Api-Key`. POST and PATCH requests save changes to your connected local database.

OpenAPI JSON: **http://localhost:5050/swagger/v1/swagger.json**.

## Run the web project in VS Code

Open **Careflow.Web.code-workspace**, or open the **apps/web** folder directly in VS Code. In its terminal:

```powershell
npm ci
npm run dev
```

Open **http://localhost:3000** and sign in with `STAFF_EMAIL` and `STAFF_PASSWORD` from your root `.env`. Your generated `apps/web/.env.local` already points to **http://localhost:5050** and keeps demo mode disabled.

For VS Code debugging, select **Careflow Web: development server** under Run and Debug, then press **F5**. The built-in Node debugger starts Next.js with inspection enabled. Optionally start **Careflow Web: browser** to debug client code in Edge after the server is running.

Next.js forwards requests directly to the local API. API requests wait up to five minutes in the local development configuration so you can pause at Visual Studio breakpoints. Use `API_TIMEOUT_MS` in `apps/web/.env.local` to adjust this; the normal server default is 15 seconds.

If you edit root app secrets or staff credentials later, run:

```powershell
.\configure-local.ps1 -ConfigureOnly
```

Then restart both the API and Next.js. This refreshes their configuration without reimporting the database. Changing `POSTGRES_PASSWORD` in `.env` does not itself change an existing PostgreSQL role's password.

## Sample data and analytics

The migrated dataset includes:

- One clearly labeled fictional clinic and eight sample patients.
- Twelve current/upcoming appointments and 437 historical appointments across May–October 2026.
- Eight medical records and generated post-visit summaries.
- Eight current invoices plus 404 paid historical invoices.
- Eight test consent forms, with signed/unsigned examples.
- Twelve portal messages, with incoming messages, staff replies, and unread examples.

All sample records are explicitly marked as fictional. No real messages are delivered, cards charged, or treatment authorized.

To insert a missing base sample clinic/patients/appointments while both native apps are running (PowerShell 7):

```powershell
pwsh -NoProfile -File .\scripts\seed-sample.ps1
```

To add missing sample medical records, invoices, and test consents:

```powershell
node --env-file=apps/web/.env.local scripts/seed-sample-details.mjs
```

To insert missing sample messages or historical analytics rows into the native database:

```powershell
.\scripts\run-sample-sql.ps1 -Dataset Messages
.\scripts\run-sample-sql.ps1 -Dataset History
```

The helpers preserve existing entries and later status/read-state changes. History is generated through yesterday in Asia/Dhaka, across the six calendar months shown in the revenue chart. Refresh the browser after adding data.

## Structure

```text
apps/api/
  Domain/           Persistence entities
  Data/             EF context, migrations, optional demo seed
  Endpoints/        Request DTOs, validation, clinic workflows
  Services/         API-key protection and Swagger configuration
  Properties/       Visual Studio launch profile
apps/web/
  .vscode/          VS Code server/browser debug configurations
  src/app/          App Router, staff login, same-origin API proxy
  src/components/   Workspace shell, dashboard, charts, modules, dialogs
  src/lib/          Typed contracts, session security, utilities
scripts/            Insert-only sample-data helpers
tests/              API, web security, and Swagger integration checks
.local/             Ignored database backup and local setup metadata
```

## Features and boundaries

Appointments support overlap checks, provider selection, statuses, search, and location filtering. Patient charts support clinical records, medications/care plans, allergies, and follow-up summaries. Billing supports invoices and manually recorded payments in USD. Consent forms capture typed acknowledgments. Analytics uses actual workspace visit/payment data. Virtual visits include a local camera/microphone check, and portal messaging stores incoming examples and staff outbox entries. Trial registration stores a 14-day evaluation request.

Live patient video calls, patient portal authentication, email/SMS delivery, card processing, verified electronic signatures, and automated trial account provisioning are not connected. The UI labels these boundaries.

The starter has one configured staff account. Location selection filters data; it is not an authorization boundary. Before using real patient data, add individual accounts/roles, location authorization, audit/amendment history, session revocation, managed secrets, backups/recovery, pagination, monitoring, and appropriate privacy/consent controls. No clinical or regulatory compliance assessment has been performed.

## Verification and maintenance

```powershell
dotnet build Careflow.slnx
npm run build --prefix apps/web
npm run typecheck --prefix apps/web
npm run format:check --prefix apps/web
```

Integration scripts are in `tests/`. API workflow tests write synthetic records and must target a **disposable database**, not your migrated app database. Web and Swagger security checks are read-only. Set `WEB_TEST_REQUIRE_SECURE=false` when testing the native development web server; the default asserts production Secure cookies. See other required environment variables at the top of each file.

For schema changes:

```powershell
dotnet tool restore
dotnet ef migrations add DescribeChange --project apps/api --output-dir Data/Migrations
```

Nullable reference types, .NET warnings as errors, strict TypeScript, DTO validation, UTC timestamps, decimal money, PostgreSQL advisory locks for scheduling, conditional consent signing, no-store API responses, API-key protection, signed HttpOnly staff sessions, same-origin checks, rate limits, and escaped CSV exports are included. User Secrets are a development configuration store, not an encrypted production vault.
