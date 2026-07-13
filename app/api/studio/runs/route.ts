import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { convexServiceToken } from "@/lib/convex-service";
import { projectStudioRunRows } from "@/lib/studio-runs";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

const listRecentRuns = makeFunctionReference<"query">("runs:listRecent");

export async function GET(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Wallet sign-in required." }, { status: 401 });
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return NextResponse.json({ error: "Convex is not configured." }, { status: 503 });

  const client = new ConvexHttpClient(url);
  const rows = await client.query(listRecentRuns, {
    limit: 8,
    principalId: principal.principalId,
    serviceToken: convexServiceToken(),
  }) as unknown[];

  return NextResponse.json({
    runs: projectStudioRunRows(rows),
  }, { headers: { "cache-control": "no-store" } });
}
