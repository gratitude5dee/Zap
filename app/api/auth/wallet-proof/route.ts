import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { apiKey, url } = getSupabasePublicConfig();
  if (!url || !apiKey) {
    return NextResponse.json({ error: "Supabase public env is not configured." }, { status: 500 });
  }

  const functionName = process.env.ZAP_WALLET_PROOF_FUNCTION ?? "zap-wallet-proof";
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    body: JSON.stringify(await request.json()),
    headers: {
      apikey: apiKey,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();
  const nextResponse = new NextResponse(text, {
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    status: response.status,
  });
  if (response.ok) {
    const token = accessTokenFromWalletProof(text);
    if (token) {
      nextResponse.cookies.set("zap_supabase_token", token, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
  }
  return nextResponse;
}

function accessTokenFromWalletProof(text: string) {
  try {
    const payload = JSON.parse(text);
    return payload.access_token ?? payload.session?.access_token ?? payload.token ?? "";
  } catch {
    return "";
  }
}
