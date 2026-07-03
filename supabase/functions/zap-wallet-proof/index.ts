// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyMessage } from "https://esm.sh/ethers@6.15.0";

const corsHeaders = {
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "OPTIONS, POST",
  "access-control-allow-origin": "*",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json();
    const proof = normalizeProof(body);
    verifyWalletProof(proof);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const admin = createClient(supabaseUrl, supabaseSecretKey());
    const password = await walletPassword(proof.address);
    const user = await getOrCreateWalletUser(admin, proof.address, password);
    await recordNonce(admin, proof.address, proof.nonce);

    const session = await createWalletSession(supabaseUrl, proof.address, password);
    const expiresIn = Number(session.expires_in ?? Deno.env.get("ZAP_WALLET_TOKEN_TTL_SECONDS") ?? 60 * 60 * 24 * 7);

    return json({
      access_token: session.access_token,
      expires_in: expiresIn,
      refresh_token: session.refresh_token,
      token_type: "bearer",
      user: {
        id: user.id,
        wallet_address: proof.address,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Wallet proof failed." }, 400);
  }
});

function normalizeProof(body: Record<string, unknown>) {
  const payload = typeof body.payload === "object" && body.payload ? body.payload as Record<string, unknown> : body;
  const address = normalizeAddress(String(payload.address ?? body.address ?? ""));
  const message = String(payload.message ?? body.message ?? "");
  const signature = String(payload.signature ?? body.signature ?? "");
  const action = String(payload.action ?? body.action ?? extractMessageField(message, "Action") ?? "");
  const nonce = String(payload.nonce ?? body.nonce ?? extractMessageField(message, "Nonce") ?? "");
  const issuedAt = String(payload.issuedAt ?? payload.issued_at ?? body.issuedAt ?? extractMessageField(message, "Issued At") ?? "");
  const expirationTime = String(payload.expirationTime ?? payload.expiration_time ?? body.expirationTime ?? extractMessageField(message, "Expiration Time") ?? "");

  if (!address) throw new Error("Wallet address is required.");
  if (!message) throw new Error("Signed message is required.");
  if (!signature) throw new Error("Wallet signature is required.");
  if (!nonce) throw new Error("Wallet proof nonce is required.");
  if (action && action !== "zap-auth") throw new Error("Wallet proof action must be zap-auth.");

  return { address, expirationTime, issuedAt, message, nonce, signature };
}

function verifyWalletProof(proof: ReturnType<typeof normalizeProof>) {
  const recovered = normalizeAddress(verifyMessage(proof.message, proof.signature));
  if (recovered !== proof.address) throw new Error("Wallet signature does not match address.");

  const now = Date.now();
  if (proof.issuedAt) {
    const issuedAtMs = Date.parse(proof.issuedAt);
    if (Number.isNaN(issuedAtMs)) throw new Error("Wallet proof issuedAt is invalid.");
    if (issuedAtMs > now + 1000 * 60 * 5) throw new Error("Wallet proof issuedAt is in the future.");
  }

  if (proof.expirationTime) {
    const expiresAtMs = Date.parse(proof.expirationTime);
    if (Number.isNaN(expiresAtMs)) throw new Error("Wallet proof expirationTime is invalid.");
    if (expiresAtMs <= now) throw new Error("Wallet proof has expired.");
  }
}

async function getOrCreateWalletUser(admin, address: string, password: string) {
  const { data: existing, error: existingError } = await admin
    .from("wallet_auth_users")
    .select("user_id")
    .eq("address", address)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.user_id) {
    const { data, error } = await admin.auth.admin.getUserById(existing.user_id);
    if (error) throw error;
    if (data?.user) return await updateWalletUser(admin, data.user, address, password);
  }

  const email = walletEmail(address);
  const created = await createWalletUser(admin, address, email, password);
  const { error: linkError } = await admin
    .from("wallet_auth_users")
    .upsert({ address, user_id: created.id }, { onConflict: "address" });
  if (linkError) throw linkError;
  return created;
}

async function createWalletUser(admin, address: string, email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      provider: "thirdweb",
      wallet_address: address,
    },
  });
  if (!error && data?.user) return data.user;

  if (!String(error?.message ?? "").toLowerCase().includes("already")) throw error;

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const found = listed.users.find((user) => user.email?.toLowerCase() === email);
  if (!found) throw error;
  return await updateWalletUser(admin, found, address, password);
}

async function updateWalletUser(admin, user, address: string, password: string) {
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
    password,
    user_metadata: {
      ...user.user_metadata,
      provider: "thirdweb",
      wallet_address: address,
    },
  });
  if (error) throw error;
  return data?.user ?? user;
}

async function recordNonce(admin, address: string, nonce: string) {
  const { error } = await admin
    .from("wallet_auth_nonces")
    .insert({ address, nonce });
  if (error) {
    if (String(error.code) === "23505") throw new Error("Wallet proof nonce was already used.");
    throw error;
  }
}

async function createWalletSession(supabaseUrl: string, address: string, password: string) {
  const client = createClient(supabaseUrl, supabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: walletEmail(address),
    password,
  });
  if (error || !data.session?.access_token) throw new Error(error?.message ?? "Could not create Supabase wallet session.");
  return data.session;
}

async function walletPassword(address: string) {
  const secret = requiredEnv("ZAP_WALLET_AUTH_SECRET");
  const material = new TextEncoder().encode(`${secret}:${address}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return `zap_${encodeBase64Url(new Uint8Array(digest))}`;
}

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function extractMessageField(message: string, field: string) {
  const match = message.match(new RegExp(`^${field}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function normalizeAddress(address: string) {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) return "";
  return normalized;
}

function walletEmail(address: string) {
  return `${address.slice(2)}@wallet.zap.local`;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function supabaseSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const encoded = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!encoded) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS is required.");
  const keys = JSON.parse(encoded);
  const key = keys.default ?? Object.values(keys)[0];
  if (!key || typeof key !== "string") throw new Error("SUPABASE_SECRET_KEYS must include a secret key.");
  return key;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "content-type": "application/json" },
    status,
  });
}
