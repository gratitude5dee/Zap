import { NextResponse } from "next/server";
import { recordProviderWebhook } from "@/lib/provider-webhooks";

export async function POST(request: Request) {
  const payload = await request.json();
  const result = await recordProviderWebhook("fal", payload, { url: request.url });
  return NextResponse.json({ ok: true, result });
}
