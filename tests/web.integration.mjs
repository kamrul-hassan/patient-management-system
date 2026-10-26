import assert from "node:assert/strict";

const base = process.env.WEB_TEST_URL;
const email = process.env.WEB_TEST_EMAIL;
const password = process.env.WEB_TEST_PASSWORD;
if (!base || !email || !password)
  throw new Error(
    "Set WEB_TEST_URL, WEB_TEST_EMAIL, and WEB_TEST_PASSWORD for a non-demo web server.",
  );
const origin = new URL(base).origin;
let checks = 0;
async function expectStatus(response, status) {
  assert.equal(response.status, status, await response.text());
  checks++;
}
await expectStatus(await fetch(`${base}/api/workspace`), 401);
await expectStatus(
  await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" },
    body: JSON.stringify({ email, password }),
  }),
  403,
);
await expectStatus(
  await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password: "incorrect" }),
  }),
  401,
);
await expectStatus(
  await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: "null",
  }),
  400,
);
const response = await fetch(`${base}/api/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ email, password }),
});
assert.equal(response.status, 200);
checks++;
const setCookie = response.headers.get("set-cookie");
assert.ok(setCookie?.includes("HttpOnly"));
assert.ok(setCookie?.toLowerCase().includes("samesite=strict"));
const requireSecureCookie = process.env.WEB_TEST_REQUIRE_SECURE !== "false";
assert.equal(setCookie?.includes("Secure"), requireSecureCookie);
const cookie = setCookie.split(";")[0];
const workspace = await fetch(`${base}/api/workspace`, { headers: { Cookie: cookie } });
assert.equal(workspace.status, 200);
checks++;
assert.ok((await workspace.json()).locations.length > 0);
await expectStatus(
  await fetch(`${base}/api/patients`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: "https://untrusted.example",
    },
    body: "{}",
  }),
  403,
);
await expectStatus(
  await fetch(`${base}/api/patients`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin },
    body: "{}",
  }),
  400,
);
await expectStatus(
  await fetch(`${base}/api/workspace`, {
    headers: { Cookie: "careflow-session=9999999999999.invalid" },
  }),
  401,
);
await expectStatus(
  await fetch(`${base}/api/auth`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: origin },
  }),
  200,
);
console.log(
  `PASS: ${checks} web security checks (staff login, HttpOnly sessions, expected Secure-cookie mode, protected API proxy, CSRF, malformed requests, invalid cookies, logout).`,
);
