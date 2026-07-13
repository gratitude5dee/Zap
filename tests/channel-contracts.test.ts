import { describe, expect, it } from "vitest";
import {
  CHANNEL_REQUIRED_ENV,
  CHANNEL_WEBHOOK_PATHS,
  assertChannelEnvironment,
  missingChannelEnvironment,
  redeemDirectChannelLinkCommand,
  imessagePrincipalFromEvent,
  parseImessageBridgeEvent,
  resolveChannelSessionAuth,
  slackPrincipalFromMessage,
  telegramPrincipalFromMessage,
} from "../lib/channel-runtime";
import {
  UpstashChannelLinkStore,
  UpstashReplayStore,
} from "../lib/channel-security-upstash";
import type { ChannelLinkCodeRecord, ChannelLinkRecord } from "../lib/channel-security";

describe("chat channel contracts", () => {
  it("pins exact public webhook paths and credential requirements", () => {
    expect(CHANNEL_WEBHOOK_PATHS).toEqual({
      imessage: "/eve/v1/imessage",
      slack: "/eve/v1/slack",
      telegram: "/eve/v1/telegram",
    });
    expect(CHANNEL_REQUIRED_ENV.slack).toEqual([
      "CHANNEL_LINK_SECRET",
      "REDIS_URL",
      "SLACK_BOT_TOKEN",
      "SLACK_SIGNING_SECRET",
      "UPSTASH_REDIS_REST_TOKEN",
      "UPSTASH_REDIS_REST_URL",
    ]);
    expect(CHANNEL_REQUIRED_ENV.telegram).toEqual([
      "CHANNEL_LINK_SECRET",
      "REDIS_URL",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_WEBHOOK_SECRET_TOKEN",
      "TELEGRAM_TENANT_ID",
      "UPSTASH_REDIS_REST_TOKEN",
      "UPSTASH_REDIS_REST_URL",
    ]);
    expect(CHANNEL_REQUIRED_ENV.imessage).toEqual([
      "CHANNEL_LINK_SECRET",
      "IMESSAGE_BRIDGE_TOKEN",
      "IMESSAGE_BRIDGE_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "UPSTASH_REDIS_REST_URL",
    ]);
  });

  it("reports every missing selected-channel credential once and fails before deployment", () => {
    const env = {
      CHANNEL_LINK_SECRET: "link-secret",
      SLACK_BOT_TOKEN: "xoxb-test",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
    };

    expect(missingChannelEnvironment(["slack", "imessage"], env)).toEqual([
      "IMESSAGE_BRIDGE_TOKEN",
      "IMESSAGE_BRIDGE_URL",
      "REDIS_URL",
      "SLACK_SIGNING_SECRET",
      "UPSTASH_REDIS_REST_URL",
    ]);
    expect(() => assertChannelEnvironment(["slack", "imessage"], env)).toThrow(
      /Selected Sprite channels are not configured.*IMESSAGE_BRIDGE_TOKEN.*UPSTASH_REDIS_REST_URL/,
    );
  });

  it("accepts an empty channel list without requiring optional integrations", () => {
    expect(missingChannelEnvironment([], {})).toEqual([]);
    expect(() => assertChannelEnvironment([], {})).not.toThrow();
  });

  it("maps Slack and Telegram users with an adapter-scoped tenant", () => {
    expect(slackPrincipalFromMessage({
      author: { userId: "U123" },
      raw: { team_id: "T123" },
    })).toEqual({ adapter: "slack", tenantId: "T123", userId: "U123" });
    expect(telegramPrincipalFromMessage({ author: { userId: "456" } }, "zap_bot")).toEqual({
      adapter: "telegram",
      tenantId: "zap_bot",
      userId: "456",
    });
  });

  it("attaches wallet auth only when the channel principal is linked", async () => {
    const principal = { adapter: "slack", tenantId: "T123", userId: "U123" };
    const store = new FakeLinkStore();

    await expect(resolveChannelSessionAuth(principal, store, { isDirectMessage: true })).resolves.toEqual({
      attributes: {
        channelAdapter: "slack",
        channelIsDirectMessage: "true",
        channelPrincipalKey: JSON.stringify(["slack", "T123", "U123"]),
        channelTenantId: "T123",
        channelUserId: "U123",
      },
      authenticator: "channel-unlinked",
      principalId: JSON.stringify(["slack", "T123", "U123"]),
      principalType: "channel",
    });
    store.link = {
      linkedAt: 123,
      principal,
      principalKey: JSON.stringify(["slack", "T123", "U123"]),
      walletPrincipalId: "wallet:0x1111111111111111111111111111111111111111",
      walletUserId: "wallet-user-1",
    };
    await expect(resolveChannelSessionAuth(principal, store, { isDirectMessage: true })).resolves.toEqual({
      attributes: {
        channelAdapter: "slack",
        channelIsDirectMessage: "true",
        channelPrincipalKey: JSON.stringify(["slack", "T123", "U123"]),
        channelTenantId: "T123",
        channelUserId: "U123",
        providerId: "channel-link",
        walletUserId: "wallet-user-1",
      },
      authenticator: "channel-link",
      principalId: "wallet:0x1111111111111111111111111111111111111111",
      principalType: "user",
    });
  });

  it("refuses to redeem a visible wallet link code outside a direct message", async () => {
    await expect(redeemDirectChannelLinkCommand({
      isDirectMessage: false,
      principal: { adapter: "slack", tenantId: "T123", userId: "U123" },
      text: "/link 0011-2233-4455-6677",
    })).resolves.toEqual({
      linked: false,
      message: "For your security, wallet link codes can only be redeemed in a direct message with Zap.",
    });
  });

  it("validates the vendor-neutral iMessage bridge envelope", () => {
    const event = parseImessageBridgeEvent({
      conversationId: "conversation-1",
      eventId: "event-1",
      tenantId: "bridge-account-1",
      text: "Run a plan",
      userId: "+15551234567",
    });
    expect(imessagePrincipalFromEvent(event)).toEqual({
      adapter: "imessage",
      tenantId: "bridge-account-1",
      userId: "+15551234567",
    });
    expect(() => parseImessageBridgeEvent({ eventId: "event-1" })).toThrow(/conversationId/);
  });
});

describe("Upstash channel security adapters", () => {
  it("uses atomic GETDEL for one-use link codes", async () => {
    const redis = new FakeRedis();
    const store = new UpstashChannelLinkStore(redis);
    const record: ChannelLinkCodeRecord = {
      codeHash: "hash-only",
      createdAt: 1_000,
      expiresAt: 61_000,
      walletPrincipalId: "wallet:0x1111111111111111111111111111111111111111",
      walletUserId: "wallet-user-1",
    };

    await store.saveLinkCode(record);
    await expect(store.consumeLinkCode("hash-only")).resolves.toEqual(record);
    await expect(store.consumeLinkCode("hash-only")).resolves.toBeNull();
    expect(redis.getdelCalls).toEqual(["zap:channel:code:hash-only", "zap:channel:code:hash-only"]);
  });

  it("claims iMessage event ids once with NX and an expiry", async () => {
    const redis = new FakeRedis();
    const store = new UpstashReplayStore(redis, () => 1_000);

    await expect(store.claim("event-1", 61_000)).resolves.toBe(true);
    await expect(store.claim("event-1", 61_000)).resolves.toBe(false);
    expect(redis.lastSetOptions).toEqual({ nx: true, px: 60_000 });
  });
});

class FakeLinkStore {
  link: ChannelLinkRecord | null = null;

  async consumeLinkCode() {
    return null;
  }

  async getPrincipalLink() {
    return this.link;
  }

  async saveLinkCode() {}

  async savePrincipalLink(record: ChannelLinkRecord) {
    this.link = record;
  }
}

class FakeRedis {
  readonly values = new Map<string, unknown>();
  readonly getdelCalls: string[] = [];
  lastSetOptions: Record<string, unknown> | undefined;

  async get<T>(key: string) {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async getdel<T>(key: string) {
    this.getdelCalls.push(key);
    const value = (this.values.get(key) as T | undefined) ?? null;
    this.values.delete(key);
    return value;
  }

  async set(key: string, value: unknown, options?: Record<string, unknown>) {
    this.lastSetOptions = options;
    if (options?.nx && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }
}
