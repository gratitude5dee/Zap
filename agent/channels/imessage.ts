import { defineChannel, POST } from "eve/channels";
import {
  CHANNEL_WEBHOOK_PATHS,
  getChannelLinkStore,
  imessagePrincipalFromEvent,
  parseImessageBridgeEvent,
  redeemDirectChannelLinkCommand,
  resolveChannelSessionAuth,
} from "../../lib/channel-runtime";
import {
  formatImessageInputRequests,
  imessageConversationKey,
  MemoryImessageInputStore,
  parseImessageInputResponse,
  UpstashImessageInputStore,
  type ImessageInputStore,
} from "../../lib/imessage-hitl";
import { UpstashReplayStore } from "../../lib/channel-security-upstash";
import {
  MemoryReplayStore,
  verifyImessageBridgeRequest,
  type ReplayStore,
} from "../../lib/imessage-bridge-security";
import { getRedis } from "../../lib/redis";
import { isSpriteChannelEnabled } from "../../lib/sprite-runtime";

type ImessageChannelState = {
  conversationId: string | null;
  tenantId: string | null;
};

const memoryReplayStore = new MemoryReplayStore();
let replayStore: ReplayStore | undefined;
const memoryInputStore = new MemoryImessageInputStore();
let inputStore: ImessageInputStore | undefined;

export default defineChannel<ImessageChannelState, { state: ImessageChannelState }>({
  context(state) {
    return { state };
  },
  events: {
    async "input.requested"(event, channel) {
      if (!channel.state.conversationId || !channel.state.tenantId || event.requests.length === 0) return;
      const requests = event.requests.map((request) => ({
        allowFreeform: request.allowFreeform,
        display: request.display,
        options: request.options?.map((option) => ({
          description: option.description,
          id: option.id,
          label: option.label,
        })),
        prompt: request.prompt,
        requestId: request.requestId,
      }));
      await getInputStore().save(
        imessageConversationKey(channel.state.tenantId, channel.state.conversationId),
        requests,
        Date.now() + 10 * 60_000,
      );
      await postImessageBridgeMessage(channel.state.conversationId, formatImessageInputRequests(requests));
    },
    async "message.completed"(event, channel) {
      if (!event.message || !channel.state.conversationId || event.finishReason === "tool-calls") return;
      await postImessageBridgeMessage(channel.state.conversationId, event.message);
    },
    async "turn.failed"(_event, channel) {
      if (channel.state.conversationId) {
        await postImessageBridgeMessage(channel.state.conversationId, "Zap could not complete that request. Please try again.");
      }
    },
  },
  routes: [
    POST(CHANNEL_WEBHOOK_PATHS.imessage, async (request, { send }) => {
      if (!isSpriteChannelEnabled("imessage")) return new Response("Not found", { status: 404 });
      const secret = process.env.IMESSAGE_BRIDGE_TOKEN;
      if (!secret) return Response.json({ error: "iMessage bridge is not configured." }, { status: 503 });

      const rawBody = await request.text();
      const eventId = request.headers.get("x-imessage-event-id") ?? "";
      const signature = request.headers.get("x-imessage-signature") ?? "";
      const timestamp = request.headers.get("x-imessage-timestamp") ?? "";
      const verified = await verifyImessageBridgeRequest({
        eventId,
        rawBody,
        replayStore: getReplayStore(),
        secret,
        signature,
        timestamp,
      });
      if (!verified.ok) return Response.json({ error: verified.reason }, { status: 401 });

      try {
        const event = parseImessageBridgeEvent(JSON.parse(rawBody));
        if (event.eventId !== eventId) return Response.json({ error: "event_id_mismatch" }, { status: 400 });
        const principal = imessagePrincipalFromEvent(event);
        const linkResult = await redeemDirectChannelLinkCommand({
          isDirectMessage: true,
          principal,
          text: event.text,
        });
        if (linkResult) {
          await postImessageBridgeMessage(event.conversationId, linkResult.message);
          return Response.json({ linked: linkResult.linked, ok: true });
        }
        const auth = await resolveChannelSessionAuth(principal, getChannelLinkStore(), {
          isDirectMessage: true,
        });
        const conversationKey = imessageConversationKey(event.tenantId, event.conversationId);
        const pending = await getInputStore().consume(conversationKey);
        const responses = pending?.map((request) => parseImessageInputResponse(event.text, request));
        if (pending && responses?.some((response) => response === null)) {
          await getInputStore().save(conversationKey, pending, Date.now() + 10 * 60_000);
          await postImessageBridgeMessage(event.conversationId, formatImessageInputRequests(pending));
          return Response.json({ awaitingInput: true, ok: true });
        }
        const payload = pending
          ? { inputResponses: responses?.filter((response) => response !== null) ?? [] }
          : imessageContent(event.text, event.mediaUrls);
        const session = await send(payload, {
          auth,
          continuationToken: `${event.tenantId}:${event.conversationId}`,
          state: { conversationId: event.conversationId, tenantId: event.tenantId },
          title: "Zap via iMessage",
        });
        return Response.json({ ok: true, sessionId: session.id }, { status: 202 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Invalid iMessage bridge event." },
          { status: 400 },
        );
      }
    }),
  ],
  state: { conversationId: null, tenantId: null },
});

function getReplayStore() {
  if (replayStore) return replayStore;
  const redis = getRedis();
  if (!redis && process.env.NODE_ENV === "production") {
    throw new Error("Upstash Redis is required for production iMessage replay protection.");
  }
  replayStore = redis ? new UpstashReplayStore(redis) : memoryReplayStore;
  return replayStore;
}

function getInputStore() {
  if (inputStore) return inputStore;
  const redis = getRedis();
  if (!redis && process.env.NODE_ENV === "production") {
    throw new Error("Upstash Redis is required for production iMessage input approval state.");
  }
  inputStore = redis ? new UpstashImessageInputStore(redis) : memoryInputStore;
  return inputStore;
}

function imessageContent(text: string, mediaUrls: string[]) {
  if (mediaUrls.length === 0) return text;
  return [
    ...(text ? [{ text, type: "text" as const }] : []),
    ...mediaUrls.map((url) => ({
      data: new URL(url),
      mediaType: "application/octet-stream",
      type: "file" as const,
    })),
  ];
}

async function postImessageBridgeMessage(conversationId: string, text: string) {
  const url = process.env.IMESSAGE_BRIDGE_URL;
  const token = process.env.IMESSAGE_BRIDGE_TOKEN;
  if (!url || !token) throw new Error("IMESSAGE_BRIDGE_URL and IMESSAGE_BRIDGE_TOKEN are required for iMessage delivery.");
  const response = await fetch(url, {
    body: JSON.stringify({ conversationId, text }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) throw new Error(`iMessage bridge delivery failed with ${response.status}.`);
}
