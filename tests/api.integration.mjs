import assert from "node:assert/strict";

// Mutates only the disposable database configured by API_TEST_URL.
const base = process.env.API_TEST_URL;
const key = process.env.API_TEST_KEY;
const peer = process.env.API_TEST_PEER_URL ?? base;
if (!base || !key) throw new Error("Set API_TEST_URL and API_TEST_KEY for an isolated test API.");
const headers = { "X-Api-Key": key, "Content-Type": "application/json" };
let checks = 0;
async function request(path, method = "GET", body, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
  checks++;
  return result;
}
const health = await request("/health");
assert.equal(health.storage, "postgresql", "Integration tests must use PostgreSQL");
const unauthorized = await fetch(`${base}/api/workspace`);
assert.equal(unauthorized.status, 401);
checks++;
const location = await request(
  "/api/locations",
  "POST",
  { name: "Integration Test Clinic", address: "Test data — not a real clinic" },
  201,
);
const unique = crypto.randomUUID();
const patientPayload = {
  name: "Integration Test Patient",
  email: `test-${unique}@example.com`,
  phone: "+1 555 0100",
  dateOfBirth: "1990-01-01",
  locationId: location.id,
  bloodGroup: "O+",
  allergies: "None recorded",
};
const patient = await request("/api/patients", "POST", patientPayload, 201);
await request("/api/patients", "POST", patientPayload, 409);
await request("/api/patients", "POST", { ...patientPayload, email: "invalid" }, 400);
await request(
  "/api/patients",
  "POST",
  { ...patientPayload, email: `bad-${unique}@example.com`, locationId: crypto.randomUUID() },
  400,
);
const workspace = await request("/api/workspace");
const nextAvailable =
  Math.max(
    Date.now() + 90 * 86400000,
    ...workspace.appointments.map((a) => new Date(a.startsAt).getTime()),
  ) +
  2 * 3600000;
const appointmentPayload = {
  patientId: patient.id,
  locationId: location.id,
  provider: workspace.providers[0],
  type: "Consultation",
  startsAt: new Date(nextAvailable).toISOString(),
  durationMinutes: 30,
  reason: "Integration test",
};
const appointment = await request("/api/appointments", "POST", appointmentPayload, 201);
await request("/api/appointments", "POST", appointmentPayload, 409);
await request(
  "/api/appointments",
  "POST",
  { ...appointmentPayload, provider: workspace.providers[1] },
  409,
);
await request(
  "/api/appointments",
  "POST",
  { ...appointmentPayload, startsAt: "2000-01-01T12:00:00Z" },
  400,
);
await request(`/api/appointments/${appointment.id}`, "PATCH", { status: "Completed" }, 400);
await request(`/api/appointments/${appointment.id}`, "PATCH", { status: "Checked in" });
await request(`/api/appointments/${appointment.id}`, "PATCH", { status: "In progress" });
await request(`/api/appointments/${appointment.id}`, "PATCH", { status: "Completed" });
await request(`/api/appointments/${appointment.id}`, "PATCH", { status: "Confirmed" }, 400);
const concurrentStart = new Date(nextAvailable + 86400000).toISOString();
const concurrent = await Promise.all(
  workspace.providers.slice(0, 2).map((provider) =>
    fetch(`${provider === workspace.providers[0] ? base : peer}/api/appointments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...appointmentPayload, startsAt: concurrentStart, provider }),
    }),
  ),
);
assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
checks++;
const record = await request(
  "/api/records",
  "POST",
  {
    patientId: patient.id,
    diagnosis: "Test consultation",
    notes: "Synthetic test note",
    provider: workspace.providers[0],
    prescription: "None",
    followUp: "Test follow-up",
  },
  201,
);
assert.equal(record.patientId, patient.id);
const invoice = await request(
  "/api/invoices",
  "POST",
  {
    patientId: patient.id,
    locationId: location.id,
    description: "Test visit",
    amount: 125.5,
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  },
  201,
);
await request(
  "/api/invoices",
  "POST",
  {
    patientId: patient.id,
    locationId: location.id,
    description: "Invalid amount",
    amount: -1,
    dueAt: new Date().toISOString(),
  },
  400,
);
const paid = await request(`/api/invoices/${invoice.id}/pay`, "POST", {});
assert.equal(paid.status, "Paid");
assert.ok(paid.paidAt);
const paidAgain = await request(`/api/invoices/${invoice.id}/pay`, "POST", {});
assert.equal(
  new Date(paidAgain.paidAt).getTime(),
  new Date(paid.paidAt).getTime(),
  "Recording payment is idempotent",
);
const consent = await request(
  "/api/consents",
  "POST",
  {
    patientId: patient.id,
    title: "Test consent",
    body: "Synthetic terms for automated testing only.",
  },
  201,
);
await request(
  `/api/consents/${consent.id}/sign`,
  "POST",
  { signature: "Synthetic Test Patient", accepted: false },
  400,
);
const signed = await request(`/api/consents/${consent.id}/sign`, "POST", {
  signature: "Synthetic Test Patient",
  accepted: true,
});
assert.ok(signed.signedAt);
await request(
  `/api/consents/${consent.id}/sign`,
  "POST",
  { signature: "Changed", accepted: true },
  409,
);
const message = await request(
  "/api/messages",
  "POST",
  { patientId: patient.id, subject: "Integration test", body: "Synthetic portal message" },
  201,
);
assert.equal(message.channel, "Portal");
assert.equal(message.direction, "Outbound");
const concurrentConsent = await request(
  "/api/consents",
  "POST",
  {
    patientId: patient.id,
    title: "Concurrent consent test",
    body: "Synthetic test terms.",
  },
  201,
);
const signedTogether = await Promise.all(
  [base, peer].map((server, index) =>
    fetch(`${server}/api/consents/${concurrentConsent.id}/sign`, {
      method: "POST",
      headers,
      body: JSON.stringify({ signature: `Synthetic signer ${index + 1}`, accepted: true }),
    }),
  ),
);
assert.deepEqual(signedTogether.map((r) => r.status).sort(), [200, 409]);
checks++;
const emptyPlan = await request(
  "/api/records",
  "POST",
  {
    patientId: patient.id,
    diagnosis: "Optional fields test",
    notes: "Synthetic test note",
    provider: workspace.providers[0],
    prescription: null,
    followUp: null,
  },
  201,
);
assert.equal(emptyPlan.prescription, "");
assert.equal(emptyPlan.followUp, "");
await request(`/api/messages/${message.id}/read`, "PATCH", {}, 204);
const trial = { clinicName: "Test trial", email: `trial-${unique}@example.com` };
const registered = await request("/api/trials", "POST", trial, 201);
assert.ok(new Date(registered.endsAt) > new Date());
await request("/api/trials", "POST", trial, 409);
const scoped = await request(`/api/workspace?locationId=${location.id}`);
assert.equal(scoped.patients.length, 1);
assert.ok(scoped.appointments.every((a) => a.locationId === location.id));
assert.ok(scoped.invoices.every((i) => i.locationId === location.id));
assert.ok(scoped.records.some((r) => r.id === record.id));
const otherLocation = await request(
  "/api/locations",
  "POST",
  { name: "Second test location", address: "Synthetic test address" },
  201,
);
const visitor = await request(
  "/api/patients",
  "POST",
  { ...patientPayload, email: `visitor-${unique}@example.com`, locationId: otherLocation.id },
  201,
);
await request(
  "/api/appointments",
  "POST",
  {
    ...appointmentPayload,
    patientId: visitor.id,
    startsAt: new Date(nextAvailable + 2 * 86400000).toISOString(),
    reason: null,
  },
  201,
);
const withVisitor = await request(`/api/workspace?locationId=${location.id}`);
assert.ok(
  withVisitor.patients.some((p) => p.id === visitor.id),
  "A visiting patient's chart remains available at the appointment location",
);
console.log(
  `PASS: ${checks} PostgreSQL integration checks (authentication, validation, scheduling concurrency, clinical records, billing, consent immutability, messages, trials, location filtering).`,
);
