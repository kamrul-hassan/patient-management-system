import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Read-only checks for a persistent stack. Does not create patients or alter schema.
const compose = (args, options = {}) => execFileSync("docker", ["compose", ...args], {
  encoding: "utf8", ...options,
});
const config = JSON.parse(compose(["config", "--format", "json"]));
const base = config.services.web.environment.APP_ORIGIN;
const origin = new URL(base).origin;
const password = readFileSync(new URL("../.secrets/staff_password", import.meta.url), "utf8").trim();
const email = config.services.web.environment.STAFF_EMAIL;
const applicationConnection = readFileSync(new URL("../.secrets/application_connection", import.meta.url), "utf8");
const database = /(?:^|;)\s*database\s*=\s*([^;]+)/i.exec(applicationConnection)?.[1].trim();
assert.ok(database && /^[A-Za-z_][A-Za-z0-9_]*$/.test(database), "Expected a simple configured database name");
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(ready, "Web server did not become ready");
const page = await fetch(base);
assert.equal(page.headers.get("x-frame-options"), "DENY");
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.equal((await fetch(`${base}/api/workspace`)).status, 401);
const login = (requestOrigin, suppliedPassword) => fetch(`${base}/api/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: requestOrigin },
  body: JSON.stringify({ email, password: suppliedPassword }),
});
assert.equal((await login("https://untrusted.example", password)).status, 403);
assert.equal((await login(origin, "incorrect")).status, 401);
const session = await login(origin, password);
assert.equal(session.status, 200, "Configured staff login must succeed");
const setCookie = session.headers.get("set-cookie");
assert.match(setCookie, /HttpOnly/i);
assert.match(setCookie, /(?:^|;)\s*Secure(?:;|$)/i);
assert.match(setCookie, /SameSite=Strict/i);
const cookie = setCookie.split(";")[0];
const workspace = await fetch(`${base}/api/workspace`, { headers: { Cookie: cookie } });
assert.equal(workspace.status, 200, "Authenticated proxy must reach PostgreSQL-backed API");
assert.equal(workspace.headers.get("cache-control"), "no-store");
assert.ok(Array.isArray((await workspace.json()).patients));
assert.equal((await fetch(`${base}/api/workspace`, {
  headers: { Cookie: "careflow-session=9999999999999.invalid" },
})).status, 401);
assert.equal((await fetch(`${base}/api/auth`, {
  method: "DELETE", headers: { Cookie: cookie, Origin: origin },
})).status, 200);

compose(["exec", "-T", "web", "node", "--input-type=module"], {
  input: `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base = 'http://api:8080';
assert.equal((await (await fetch(base + '/health')).json()).storage, 'postgresql');
assert.equal((await fetch(base + '/api/workspace')).status, 401);
const key = readFileSync('/run/secrets/api_key', 'utf8').trim();
assert.equal((await fetch(base + '/api/workspace', {headers:{'X-Api-Key':key}})).status, 200);
assert.equal((await fetch(base + '/swagger/index.html', {headers:{'X-Api-Key':key}})).status, 404);
console.log('PASS: PostgreSQL-backed API, API-key enforcement, production Swagger disabled.');`,
  stdio: ["pipe", "inherit", "inherit"],
});

const privileges = compose(["exec", "-T", "db", "sh", "-c",
  `export PGPASSWORD="$(cat /run/secrets/application_password)"; exec psql --host=127.0.0.1 --username=careflow_app --dbname=${database} --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1`,
], { input: "SELECT rolsuper, rolcreatedb, rolcreaterole, has_schema_privilege(current_user, 'public', 'CREATE'), pg_has_role(current_user, 'careflow_migrator', 'MEMBER') FROM pg_roles WHERE rolname=current_user;\n" }).trim();
assert.equal(privileges, "f|f|f|f|f", "Runtime login must not own schema or hold administrative roles");

for (const name of ["api", "web"]) {
  const id = compose(["ps", "--quiet", name]).trim();
  const container = JSON.parse(execFileSync("docker", ["inspect", id], { encoding: "utf8" }))[0];
  assert.equal(container.HostConfig.ReadonlyRootfs, true);
  assert.ok(container.HostConfig.CapDrop.includes("ALL"));
  assert.ok(container.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  assert.ok(container.Config.User && !["0", "root", "0:0"].includes(container.Config.User));
  if (name === "api") assert.ok(!Object.values(container.NetworkSettings.Ports ?? {}).some(Boolean));
  if (name === "web") assert.equal(container.NetworkSettings.Ports["3000/tcp"][0].HostIp, "127.0.0.1");
}
const dbId = compose(["ps", "--quiet", "db"]).trim();
const db = JSON.parse(execFileSync("docker", ["inspect", dbId], { encoding: "utf8" }))[0];
assert.ok(!Object.values(db.NetworkSettings.Ports ?? {}).some(Boolean), "Database port must remain unpublished");
console.log(`PASS: App at ${base}, staff login, protected sessions, CSRF, read-only database queries, restricted login, non-root containers, and private ports.`);
