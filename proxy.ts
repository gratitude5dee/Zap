import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPrefixes = ["/api/providers", "/eve"];

export function proxy(request: NextRequest) {
  if (!protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (isProviderWebhook(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (isPollDrain(request.nextUrl.pathname) && hasCronSecret(request)) {
    return NextResponse.next();
  }

  if (isLocal(request) || hasAgentToken(request) || hasSupabaseSession(request)) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "Authentication required." }, { headers: { "cache-control": "no-store" }, status: 401 });
}

function isLocal(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function isProviderWebhook(pathname: string) {
  return [
    "/api/providers/aws/webhook",
    "/api/providers/fal/webhook",
    "/api/providers/gmi/webhook",
    "/api/providers/prodia/webhook",
    "/api/providers/runware/webhook",
    "/api/providers/vertex/webhook",
  ].includes(pathname);
}

function isPollDrain(pathname: string) {
  return pathname === "/api/providers/poll/drain";
}

function hasCronSecret(request: NextRequest) {
  const expected = process.env.ZAP_POLL_DRAIN_SECRET;
  return Boolean(expected) && request.headers.get("x-zap-cron-secret") === expected;
}

function hasAgentToken(request: NextRequest) {
  const expected = process.env.ZAP_AGENT_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${expected}` || request.headers.get("x-zap-agent-token") === expected;
}

function hasSupabaseSession(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return true;
  if (request.cookies.has("zap_supabase_token")) return true;
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));
}

export const config = {
  matcher: ["/api/providers/:path*", "/eve/:path*"],
};
