import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// This workflow creates synthetic patients: use only an isolated Compose project.
if (!process.env.COMPOSE_PROJECT_NAME?.match(/^careflow-(ci|test)(-|$)/)) {
  throw new Error("Set COMPOSE_PROJECT_NAME to careflow-ci or careflow-test-* for a disposable stack.");
}
const base = process.env.APP_ORIGIN ?? "http://localhost:3100";
let ready = false;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
    if (response.ok) { ready = true; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(ready, "Docker web server did not become ready");

const compose = (args, options = {}) => execFileSync("docker", ["compose", ...args], {
  encoding: "utf8", ...options,
});
const config = JSON.parse(compose(["config", "--format", "json"]));
assert.ok(!config.services.db.ports?.length, "Database must not publish ports");
assert.ok(!config.services.api.ports?.length, "API must not publish ports");
for (const name of ["api", "web", "migrate"]) {
  assert.equal(config.services[name].read_only, true);
  assert.ok(config.services[name].cap_drop.includes("ALL"));
  assert.ok(config.services[name].security_opt.includes("no-new-privileges:true"));
  for (const [key, value] of Object.entries(config.services[name].environment ?? {})) {
    if (/^(API_KEY|ApiKey|SESSION_SECRET|STAFF_PASSWORD|ConnectionStrings__Careflow)$/.test(key)) {
      assert.fail(`Secret value passed through container environment: ${name}.${key}`);
    }
  }
}

// Execute the existing API workflow suite INSIDE the network. Credentials stay
// in mounted files and are never interpolated into host commands or log output.
compose(["exec", "-T", "web", "node", "--input-type=module"], {
  input: `import { readFileSync } from 'node:fs';
process.env.API_TEST_URL = 'http://api:8080';
process.env.API_TEST_KEY = readFileSync('/run/secrets/api_key', 'utf8').trim();
${readFileSync(new URL("./api.integration.mjs", import.meta.url), "utf8")}`,
  stdio: ["pipe", "inherit", "inherit"],
});

const permission = spawnSync("docker", ["compose", "exec", "-T", "db", "sh", "-c",
  'export PGPASSWORD="$(cat /run/secrets/application_password)"; exec psql --host=127.0.0.1 --username=careflow_app --dbname=careflow --no-password --set=ON_ERROR_STOP=1 --command="CREATE TABLE forbidden_runtime_ddl (id integer);"',
], { encoding: "utf8" });
assert.notEqual(permission.status, 0, "Runtime login must not create tables");
assert.match(permission.stderr, /permission denied for schema public/, "DDL must fail for insufficient privileges");

const password = readFileSync(new URL("../.secrets/staff_password", import.meta.url), "utf8").trim();
const result = spawnSync(process.execPath, ["tests/web.integration.mjs"], {
  env: { ...process.env, WEB_TEST_URL: base, WEB_TEST_EMAIL: config.services.web.environment.STAFF_EMAIL, WEB_TEST_PASSWORD: password },
  stdio: "inherit",
});
assert.equal(result.status, 0, "Web security suite failed");
const page = await fetch(base);
assert.equal(page.headers.get("x-frame-options"), "DENY");
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.equal(page.headers.get("strict-transport-security"), "max-age=31536000");
console.log("PASS: Docker isolation, restricted database login, API workflows, staff sessions, CSRF, and security headers.");
