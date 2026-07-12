import { resolveSpriteSandboxPreset, type SpriteSpec } from "@wzrdtech/core";
import type { SpriteComposioSession } from "./sprite-composio";

const inheritedEnvKeys = [
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "BOX_API_KEY",
  "CHANNEL_LINK_SECRET",
  "CONVEX_URL",
  "E2B_API_KEY",
  "FAL_KEY",
  "GMI_API_KEY",
  "IMESSAGE_BRIDGE_TOKEN",
  "IMESSAGE_BRIDGE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "PRODIA_API_KEY",
  "REDIS_URL",
  "RUNWARE_API_KEY",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_TENANT_ID",
  "TELEGRAM_WEBHOOK_SECRET_TOKEN",
  "THIRDWEB_SECRET_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "WZRD_CLOUD_DAILY_CAP_USD",
  "WZRD_CLOUD_PROVIDER_KEYS",
  "ZAP_CONVEX_SERVICE_TOKEN",
  "ZAP_PROVIDER_WEBHOOK_SECRET",
  "ZAP_SECRET_REVEAL_TOKEN",
] as const;

export function spriteEnvironment(input: {
  authorId: string;
  composio: SpriteComposioSession | null;
  manifest: string;
  spec: SpriteSpec;
}) {
  const sandbox = resolveSpriteSandboxPreset(input.spec.sandbox);
  const explicit = {
    COMPOSIO_MCP_HEADERS: input.composio ? JSON.stringify(input.composio.mcpHeaders) : undefined,
    COMPOSIO_MCP_URL: input.composio?.mcpUrl,
    SPRITE_CHANNELS: JSON.stringify(input.spec.channels),
    SPRITE_CONNECTIONS: JSON.stringify(input.spec.connections),
    SPRITE_MANIFEST_BASE64: Buffer.from(input.manifest).toString("base64"),
    SPRITE_OWNER_PRINCIPAL: input.authorId,
    ZAP_LLM_MODEL: input.spec.model.id,
    ZAP_LLM_ROUTE: input.spec.model.route,
    ZAP_SANDBOX_BACKEND: sandbox.backend,
  };
  const values = new Map<string, string>();
  for (const key of inheritedEnvKeys) {
    const value = process.env[key];
    if (value) values.set(key, value);
  }
  for (const [key, value] of Object.entries(explicit)) {
    if (value) values.set(key, value);
  }
  return [...values].map(([key, value]) => ({
    key,
    target: ["production", "preview"] as Array<"production" | "preview">,
    type: "sensitive" as const,
    value,
  }));
}
