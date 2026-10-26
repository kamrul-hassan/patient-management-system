# Verification record

Verified locally on 26 October 2026 (Asia/Dhaka).

- ASP.NET Core 10 build: passed, zero warnings/errors.
- Next.js 16.4.3 production build and strict TypeScript: passed.
- Frontend Prettier check: passed.
- Docker Compose configuration validation: passed.
- NuGet vulnerable package check, including transitive dependencies: none reported.
- npm installation audit: zero reported vulnerabilities.
- PostgreSQL 18 migration: applied to a disposable Docker database; a subsequent API start reported the database up to date.
- 39 PostgreSQL integration checks: passed, including simultaneous booking and consent signing against two API instances sharing the same database.
- 10 production-mode web security checks: passed, including login, secure cookies, protected API access, origin validation, malformed input and invalid sessions.
- Browser: created a synthetic patient, scheduled a consultation, and confirmed both in the directory/schedule.
- Browser: reviewed desktop and 390px mobile layouts; corrected table overflow and inaccessible offscreen navigation. Mobile document width stayed within the viewport after the fix.

Screenshots use synthetic demo data: [desktop](dashboard.png), [mobile](mobile.png).

Docker images were subsequently built and all three Compose services started successfully. PostgreSQL reported healthy, the migration applied, and the configured staff credentials were verified against the production web container. An authenticated workspace request confirmed non-demo PostgreSQL mode. Credentials and session cookies were not printed.

These checks do not assess regulatory compliance or integrations with external video, payment, messaging or identity providers.

## Previous Docker / Visual Studio hybrid setup (superseded)

- Added the `Careflow API (Docker services)` launch profile and a development User Secrets ID. The profile was launched successfully with `dotnet run` and connected to Docker PostgreSQL through `127.0.0.1:55432`.
- The API stayed bound to localhost on port 5050. Docker Next.js reached it through `host.docker.internal:5050`; the health check confirmed PostgreSQL mode.
- Docker Compose debug override runs the database and web containers with the container API stopped. The existing named database volume is reused.
- The web image rebuilt successfully with a five-minute debug API timeout. TypeScript and Prettier checks passed.
- All 10 web security checks passed through Docker Next.js to the host API using the configured staff account. Credentials and cookies were not printed.
- Before/after database counts matched: 8 patients, 449 appointments, 412 invoices, 8 medical records, 8 consent forms, and 12 messages.
- The temporary terminal API is stopped after verification so Visual Studio can claim port 5050 on F5. IDE breakpoint interaction itself was not automated.

## Current native setup

- The Docker debugging override and launcher were removed. The API now has a `Careflow.Api` Visual Studio launch profile; the web folder has VS Code server/browser launch configurations and a standalone workspace file.
- The complete Docker database was backed up to ignored `.local/backups` and restored to the dedicated local PostgreSQL 18 database and role `careflow_local` on `127.0.0.1:5432`. The existing local PostgreSQL administrator entered their password privately in PowerShell; it was not written to project files or chat.
- Restore counts matched: 1 clinic, 8 patients, 449 appointments, 412 invoices, 8 medical records, 8 consent forms, 12 messages, and 0 trials. Unrelated native databases and roles were not changed.
- All project Docker containers are stopped. Native API startup found its EF migrations up to date; native Next.js loaded `apps/web/.env.local` and served on `http://localhost:3000`.
- Swagger UI is available during API Development at `/swagger`, with API-key authorization and feature-grouped operations. The Visual Studio profile opens it on F5. Swagger checks passed for all 14 operations, correct API-key metadata, protected endpoint access, and disabling documentation in Production.
- API secrets use .NET User Secrets. Frontend secrets use ignored `apps/web/.env.local`. The Docker database volume and backup remain intact for recovery.
- All 10 web security checks passed in native development mode, including staff login, HttpOnly sessions, same-origin protection, malformed requests, and authenticated workspace access. The API returned the full migrated dataset with demo mode disabled while all Docker containers were stopped.
- Temporary native API/web test processes were stopped after verification. Ports 5050 and 3000 are free for the user's Visual Studio and VS Code sessions; the native PostgreSQL service remains running.
