import "server-only";
import { readFileSync } from "node:fs";

// Runtime-only Docker secrets. Never import this module into client components.
export function serverSecret(name: "API_KEY" | "SESSION_SECRET" | "STAFF_PASSWORD") {
  const file = process.env[`${name}_FILE`];
  if (file) {
    try {
      return readFileSync(file, "utf8").trimEnd();
    } catch {
      throw new Error(`Cannot read the configured ${name} secret file.`);
    }
  }
  return process.env[name];
}
