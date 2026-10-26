import type { NextRequest } from "next/server";

export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = process.env.APP_ORIGIN;
  if (configured) return origin === new URL(configured).origin;
  if (process.env.NODE_ENV === "production") return false;
  // Next's internal request URL can use localhost even when a browser uses 127.0.0.1.
  const host = request.headers.get("host");
  if (!host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  return origin === `http://${host}` || origin === `https://${host}`;
}
