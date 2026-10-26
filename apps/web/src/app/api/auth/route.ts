import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { sameOrigin } from "@/lib/security";
import { createHash, timingSafeEqual } from "node:crypto";
import { serverSecret } from "@/lib/server-secrets";

// Single staff account for the starter. Deploy behind an identity provider for teams.
const attempts = new Map<string, { count: number; reset: number }>();
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ detail: "Invalid origin." }, { status: 403 });
  const bucket = "staff-login";
  const attempt = attempts.get(bucket);
  if (attempt && attempt.reset > Date.now() && attempt.count >= 10)
    return NextResponse.json(
      { detail: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  const next =
    attempt && attempt.reset > Date.now()
      ? { ...attempt, count: attempt.count + 1 }
      : { count: 1, reset: Date.now() + 900000 };
  attempts.set(bucket, next);
  let body: { email?: string; password?: string };
  try {
    const value: unknown = await request.json();
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return NextResponse.json(
        { detail: "Expected an object with email and password." },
        { status: 400 },
      );
    }
    body = value as typeof body;
  } catch {
    return NextResponse.json({ detail: "Invalid request." }, { status: 400 });
  }
  const expected = serverSecret("STAFF_PASSWORD");
  const hash = (v: string) => createHash("sha256").update(v).digest();
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    !expected ||
    expected.length < 12 ||
    expected.startsWith("replace-") ||
    body.email !== process.env.STAFF_EMAIL ||
    !timingSafeEqual(hash(body.password), hash(expected))
  )
    return NextResponse.json({ detail: "Email or password is incorrect." }, { status: 401 });
  attempts.delete(bucket);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("careflow-session", createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ detail: "Invalid origin." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("careflow-session");
  return response;
}
