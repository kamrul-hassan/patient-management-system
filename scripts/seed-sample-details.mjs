// Run inside the Docker web service so the existing server API key stays in its environment.
const base = process.env.API_URL?.replace(/\/$/, "");
const key = process.env.API_KEY;
if (!base || !key) throw new Error("API_URL and API_KEY must be configured.");
if (!["api", "localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("This sample-data helper is restricted to the local clinic API.");
}

async function request(path, method = "GET", body) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${result.detail ?? result.title ?? response.status}`);
  }
  return result;
}

const marker = "[CAREFLOW SAMPLE]";
const workspace = await request("workspace");
if (workspace.demo) throw new Error("The API must use PostgreSQL, not in-memory demo storage.");
const clinic = workspace.locations.find(
  (location) => location.name === "Careflow Sample Clinic (Test Data)",
);
if (!clinic) throw new Error("Create the sample clinic and patients first with seed-sample.ps1.");
const patients = workspace.patients
  .filter(
    (patient) =>
      patient.locationId === clinic.id &&
      patient.name.endsWith(" (Sample)") &&
      /^careflow\.sample\.[a-z.]+@example\.com$/.test(patient.email),
  )
  .sort((a, b) => a.email.localeCompare(b.email));
if (patients.length !== 8)
  throw new Error("Expected the eight explicitly labeled sample patients; no data was added.");

const originalIds = Object.fromEntries(
  ["locations", "patients", "appointments", "records", "invoices", "consents"].map((name) => [
    name,
    workspace[name].map((item) => item.id),
  ]),
);
const titles = [
  "Annual wellness review",
  "Routine follow-up",
  "Virtual consultation review",
  "Preventive care visit",
  "General health review",
  "Follow-up assessment",
  "Routine check-up",
  "Wellness consultation",
];
const fees = [180, 120, 90, 150, 180, 120, 90, 150];
const added = { medicalRecords: 0, invoices: 0, consentForms: 0 };
const dueAt = new Date(Date.now() + 14 * 86400000).toISOString();

for (const [index, patient] of patients.entries()) {
  const diagnosis = `${marker} ${titles[index]}`;
  const existingRecord = workspace.records.find(
    (record) => record.patientId === patient.id && record.diagnosis === diagnosis,
  );
  if (!existingRecord) {
    await request("records", "POST", {
      patientId: patient.id,
      diagnosis,
      notes:
        "FICTIONAL TEST RECORD ONLY. No actual consultation or examination took place. This sample documents a discussion of general wellbeing and a review of fictional history so the medical chart and post-visit summary features can be explored.",
      provider: workspace.providers[index % workspace.providers.length],
      prescription: "TEST DATA ONLY. No medication prescribed or issued.",
      followUp:
        "Fictional follow-up plan: review the sample visit summary and arrange a demonstration follow-up in two weeks. No real clinical action is requested.",
    });
    added.medicalRecords++;
  }

  const description = `${marker} ${titles[index]} - fictional billing entry`;
  const existingInvoice = workspace.invoices.find(
    (invoice) =>
      invoice.patientId === patient.id &&
      invoice.locationId === clinic.id &&
      invoice.description === description,
  );
  if (!existingInvoice) {
    const invoice = await request("invoices", "POST", {
      patientId: patient.id,
      locationId: clinic.id,
      description,
      amount: fees[index],
      dueAt,
    });
    // Only newly created sample invoices are marked paid. Existing balances are never changed.
    if (index < 4) await request(`invoices/${invoice.id}/pay`, "POST", {});
    added.invoices++;
  }

  const title = `${marker} Treatment acknowledgment - TEST ONLY`;
  const existingConsent = workspace.consents.find(
    (consent) => consent.patientId === patient.id && consent.title === title,
  );
  if (!existingConsent) {
    const consent = await request("consents", "POST", {
      patientId: patient.id,
      title,
      body: "FICTIONAL TEST FORM ONLY. This sample is for testing the consent review and acknowledgment screens. It is not valid medical consent, does not authorize treatment, and creates no legal agreement. In this fictional scenario, the sample patient has reviewed a demonstration consultation, may ask questions, and may decline. Any signature stored on this form is synthetic test data.",
    });
    // Synthetic signatures on explicitly non-binding test forms exercise the read-only signed view.
    if (index < 4) {
      await request(`consents/${consent.id}/sign`, "POST", {
        signature: `TEST SIGNATURE - ${patient.name}`,
        accepted: true,
      });
    }
    added.consentForms++;
  }
}

const verified = await request("workspace");
for (const [collection, ids] of Object.entries(originalIds)) {
  const remaining = new Set(verified[collection].map((item) => item.id));
  if (ids.some((id) => !remaining.has(id)))
    throw new Error(`An original ${collection} entry is missing.`);
}
const patientIds = new Set(patients.map((patient) => patient.id));
const records = verified.records.filter(
  (record) => patientIds.has(record.patientId) && record.diagnosis.startsWith(marker),
);
const invoices = verified.invoices.filter(
  (invoice) =>
    patientIds.has(invoice.patientId) &&
    invoice.locationId === clinic.id &&
    invoice.description.startsWith(marker),
);
const consents = verified.consents.filter(
  (consent) => patientIds.has(consent.patientId) && consent.title.startsWith(marker),
);
for (const patient of patients) {
  if (
    ![records, invoices, consents].every((items) =>
      items.some((item) => item.patientId === patient.id),
    )
  ) {
    throw new Error("At least one sample patient is missing a related record.");
  }
}
console.log(
  JSON.stringify(
    {
      storage: "postgresql",
      samplePatients: patients.length,
      added,
      verified: {
        medicalRecords: records.length,
        invoices: invoices.length,
        paidInvoices: invoices.filter((invoice) => invoice.status === "Paid").length,
        pendingInvoices: invoices.filter((invoice) => invoice.status === "Pending").length,
        consentForms: consents.length,
        signedConsents: consents.filter((consent) => consent.signedAt).length,
        unsignedConsents: consents.filter((consent) => !consent.signedAt).length,
      },
      existingRecordsPreserved: true,
    },
    null,
    2,
  ),
);
