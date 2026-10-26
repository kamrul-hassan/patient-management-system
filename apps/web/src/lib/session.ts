import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverSecret } from "@/lib/server-secrets";

export function isDemo() {
  return process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
}

function sign(value: string) {
  const secret = serverSecret("SESSION_SECRET");
  if (!secret || secret.length < 32 || secret.startsWith("replace-"))
    throw new Error("Configure SESSION_SECRET (32+ random characters).");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createSession() {
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expires}.${sign(expires)}`;
}

export async function authenticated() {
  if (isDemo()) return true;
  const token = (await cookies()).get("careflow-session")?.value;
  if (!token) return false;
  const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const [, expires, signature] = match;
  if (Number(expires) <= Date.now()) return false;
  const expected = sign(expires);
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
