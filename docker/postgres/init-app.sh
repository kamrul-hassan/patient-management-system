#!/bin/sh
(
set -eu

# Runs only when PostgreSQL initializes a NEW Docker volume.
# Passwords are read from mounts and never passed on the command line.
MIGRATION_PASSWORD=$(cat /run/secrets/migration_password)
APPLICATION_PASSWORD=$(cat /run/secrets/application_password)
export MIGRATION_PASSWORD APPLICATION_PASSWORD
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-password --set=ON_ERROR_STOP=1 <<'SQL'
\getenv migration_password MIGRATION_PASSWORD
\getenv application_password APPLICATION_PASSWORD
SELECT format('CREATE ROLE careflow_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'migration_password') \gexec
SELECT format('CREATE ROLE careflow_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'application_password') \gexec
ALTER DATABASE careflow OWNER TO careflow_migrator;
REVOKE ALL ON DATABASE careflow FROM PUBLIC;
GRANT CONNECT ON DATABASE careflow TO careflow_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO careflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE careflow_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO careflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE careflow_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO careflow_app;
SQL
unset MIGRATION_PASSWORD APPLICATION_PASSWORD
)
