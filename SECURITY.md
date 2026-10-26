# Security

Do not post passwords, tokens, database dumps, or patient information in issues or pull requests. Report vulnerabilities using the repository's private security reporting feature when available; otherwise contact the maintainer privately before sharing details.

## Supported configuration

Use the latest reviewed commit and install dependency security updates. GitHub CI checks builds, dependency advisories, publication rules, and Docker integration. Dependabot proposes updates; it does not merge them automatically.

Docker credentials belong in the ignored `.secrets/` directory or an external secret manager. Compose mounts files; it does not encrypt secrets at rest. Restrict host access and protect backups separately. Never use Docker build arguments, image layers, `NEXT_PUBLIC_*`, or committed configuration for credentials. The Docker socket and host administrator can access containers and secrets; do not expose the socket.

The database has no published host port. API traffic reaches it through an internal network. The API uses a non-owner role with data access; a one-shot migration container uses a separate schema owner. The PostgreSQL administrator credential is mounted only into the database container. Unencrypted database transport is explicitly allowed only for this single-host network. For external databases, remove that allowance and use `SSL Mode=VerifyFull` with a trusted certificate and private connectivity.

The web port binds to loopback. Public deployments require an HTTPS reverse proxy, the exact HTTPS `APP_ORIGIN`, appropriate request limits and distributed login rate limiting. Do not publish the API or database directly. Secure session cookies and HSTS are enabled for production builds. Configure backups with encryption, retention limits, and tested restoration. Apply schema migrations as a deployment job; never grant the web application's runtime database login schema creation or administration rights.

## Patient data boundary

This remains a single-staff-account starter for synthetic data. Production use with real patient data requires individual identities with MFA, role/location authorization, audit history, session revocation, recovery procedures, monitoring, and a privacy/security assessment appropriate to the deployment. These are not supplied by Docker configuration.

## Rotation and incident response

If credentials leak, revoke or rotate them first. Removing a file from the latest commit does not erase history. Rotate database role passwords and their mounted connection files together during a planned maintenance window; generating new files alone does not change an existing database's passwords. Rotate the session secret to invalidate all sessions. Preserve existing volumes and do not use `docker compose down -v` on data you need.
