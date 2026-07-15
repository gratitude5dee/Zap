import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { drainProviderPollQueue } from "@/lib/provider-poll-drain";

export const dynamic = "force-dynamic";

/** Vercel Cron invokes this protected GET route every two minutes in production. */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await drainProviderPollQueue());
}

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("authorization");
  if (!secret || !provided) return false;
  const expected = `Bearer ${secret}`;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}
