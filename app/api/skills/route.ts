import { NextResponse } from "next/server";
import { listZapSkillDownloads } from "@/lib/zap-skills";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(await listZapSkillDownloads(origin));
}
