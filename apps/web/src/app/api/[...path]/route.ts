import { NextRequest, NextResponse } from "next/server";
import { authenticated } from "@/lib/session";
import { sameOrigin } from "@/lib/security";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!(await authenticated()))
    return NextResponse.json({ detail: "Please sign in to continue." }, { status: 401 });
  if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request))
    return NextResponse.json({ detail: "Invalid request origin." }, { status: 403 });
  const { path } = await context.params;
  if (path.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment)))
    return NextResponse.json({ detail: "Invalid path." }, { status: 400 });
  const key = process.env.API_KEY;
  if (!key)
    return NextResponse.json(
      { detail: "The API connection has not been configured." },
      { status: 503 },
    );
  try {
    // Visual Studio debugging can pause a request for longer than the normal API timeout.
    const configuredTimeout = Number(process.env.API_TIMEOUT_MS);
    const timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout >= 1000
        ? Math.min(configuredTimeout, 600000)
        : 15000;
    const response = await fetch(
      `${process.env.API_URL ?? "http://127.0.0.1:5050"}/api/${path.join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: { "X-Api-Key": key, "Content-Type": "application/json" },
        body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    return new NextResponse(response.status === 204 ? null : await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Cannot reach the clinic API. Check that the backend is running and try again." },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH };
