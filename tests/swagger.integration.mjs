import assert from "node:assert/strict";

const base = process.env.SWAGGER_TEST_URL;
const production = process.env.SWAGGER_PRODUCTION_TEST_URL;
const key = process.env.API_TEST_KEY;
if (!base || !production || !key) {
  throw new Error("Set SWAGGER_TEST_URL, SWAGGER_PRODUCTION_TEST_URL, and API_TEST_KEY.");
}
let checks = 0;
const expect = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
const ui = await fetch(`${base}/swagger/index.html`);
expect(ui.status === 200, "Development Swagger UI loads without an API key");
expect((await ui.text()).includes("Careflow API"), "Swagger UI has the clinic title");
const schemaResponse = await fetch(`${base}/swagger/v1/swagger.json`);
expect(schemaResponse.status === 200, "Development OpenAPI document is available");
const schemaText = await schemaResponse.text();
expect(!schemaText.includes(key), "The API key is never embedded in the document");
const schema = JSON.parse(schemaText);
const scheme = schema.components.securitySchemes.ApiKey;
expect(
  scheme.type === "apiKey" && scheme.in === "header" && scheme.name === "X-Api-Key",
  "Swagger uses the correct API-key header",
);
const operationIds = new Set();
let protectedCount = 0;
for (const [path, methods] of Object.entries(schema.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!["get", "post", "patch", "put", "delete"].includes(method)) continue;
    expect(
      operation.operationId && !operationIds.has(operation.operationId),
      "Operation IDs are unique",
    );
    operationIds.add(operation.operationId);
    expect(operation.tags?.length > 0, "Operations are grouped by feature");
    if (path.startsWith("/api/")) {
      expect(
        operation.security?.some((requirement) => Object.hasOwn(requirement, "ApiKey")),
        "Every clinic operation requires authorization",
      );
      expect(operation.responses["401"], "Unauthorized responses are documented");
      protectedCount++;
    }
  }
}
expect(
  protectedCount === 13 && operationIds.size === 14,
  "All current API operations are documented",
);
expect(!schema.paths["/health"].get.security?.length, "Health is documented as public");
expect(
  schema.paths["/api/patients"].post.requestBody.content["application/json"],
  "Patient creation has a JSON request schema",
);
expect(schema.paths["/api/patients"].post.responses["201"], "Creation response codes are correct");
expect(
  schema.paths["/api/messages/{id}/read"].patch.responses["204"],
  "No-content response codes are correct",
);
expect(
  (await fetch(`${base}/api/workspace`)).status === 401,
  "Swagger does not bypass endpoint authentication",
);
expect(
  (await fetch(`${base}/api/workspace`, { headers: { "X-Api-Key": "invalid" } })).status === 401,
  "Invalid API keys remain rejected",
);
expect(
  (await fetch(`${base}/api/workspace`, { headers: { "X-Api-Key": key } })).status === 200,
  "Authorized Try-it-out-equivalent request succeeds",
);
for (const path of ["/swagger/index.html", "/swagger/v1/swagger.json"]) {
  expect(
    (await fetch(`${production}${path}`, { headers: { "X-Api-Key": key } })).status === 404,
    "Swagger is not exposed in Production",
  );
}
console.log(
  `PASS: ${checks} Swagger checks (UI, document, all operations, API-key security, request/response metadata, Production disabled).`,
);
