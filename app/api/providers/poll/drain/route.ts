import { NextResponse } from "next/server";
import { drainProviderPollQueue } from "@/lib/provider-poll-drain";

export async function POST(request: Request) {
  const expectedSecret = process.env.ZAP_POLL_DRAIN_SECRET;
  const providedSecret = request.headers.get("x-zap-cron-secret");
  if ((!expectedSecret && process.env.NODE_ENV === "production") || (expectedSecret && providedSecret !== expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await drainProviderPollQueue());
}
