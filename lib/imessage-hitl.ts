export type ImessageInputOption = {
  description?: string;
  id: string;
  label: string;
};

export type ImessageInputRequest = {
  allowFreeform?: boolean;
  display?: "confirmation" | "select" | "text";
  options?: readonly ImessageInputOption[];
  prompt: string;
  requestId: string;
};

export type ImessageInputResponse = {
  optionId?: string;
  requestId: string;
  text?: string;
};

export interface ImessageInputStore {
  consume(key: string): Promise<readonly ImessageInputRequest[] | null>;
  save(key: string, requests: readonly ImessageInputRequest[], expiresAtMs: number): Promise<void>;
}

export class MemoryImessageInputStore implements ImessageInputStore {
  readonly #pending = new Map<string, { expiresAtMs: number; requests: readonly ImessageInputRequest[] }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string) {
    const record = this.#pending.get(key) ?? null;
    this.#pending.delete(key);
    if (!record || record.expiresAtMs <= this.now()) return null;
    return record.requests;
  }

  async save(key: string, requests: readonly ImessageInputRequest[], expiresAtMs: number) {
    this.#pending.set(key, { expiresAtMs, requests });
  }
}

type RedisLike = {
  getdel<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { px?: number }): Promise<unknown>;
};

export class UpstashImessageInputStore implements ImessageInputStore {
  constructor(private readonly redis: RedisLike, private readonly now: () => number = Date.now) {}

  consume(key: string) {
    return this.redis.getdel<readonly ImessageInputRequest[]>(pendingKey(key));
  }

  async save(key: string, requests: readonly ImessageInputRequest[], expiresAtMs: number) {
    await this.redis.set(pendingKey(key), requests, { px: Math.max(1, expiresAtMs - this.now()) });
  }
}

export function formatImessageInputRequests(requests: readonly ImessageInputRequest[]) {
  return requests.map((request) => {
    const options = request.options ?? [];
    const choices = options.map((option) => option.label.toLowerCase()).join(" or ");
    const instruction = choices
      ? `Reply ${choices}.`
      : request.allowFreeform !== false
        ? "Reply with your answer."
        : "Reply approve or deny.";
    return `${request.prompt}\n\n${instruction}`;
  }).join("\n\n");
}

export function parseImessageInputResponse(text: string, request: ImessageInputRequest): ImessageInputResponse | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  const options = request.options ?? [];
  const direct = options.find((option) => option.id.toLowerCase() === normalized || option.label.toLowerCase() === normalized);
  if (direct) return { optionId: direct.id, requestId: request.requestId };
  const approve = options.find((option) => /^(approve|confirm|yes|y|ok)$/.test(option.id.toLowerCase()) || /^(approve|confirm|yes)$/.test(option.label.toLowerCase()));
  const deny = options.find((option) => /^(deny|reject|no|n|cancel)$/.test(option.id.toLowerCase()) || /^(deny|reject|no|cancel)$/.test(option.label.toLowerCase()));
  if (/^(approve|confirm|yes|y|ok)$/.test(normalized) && approve) return { optionId: approve.id, requestId: request.requestId };
  if (/^(deny|reject|no|n|cancel)$/.test(normalized) && deny) return { optionId: deny.id, requestId: request.requestId };
  if (request.allowFreeform !== false) return { requestId: request.requestId, text: text.trim() };
  return null;
}

export function imessageConversationKey(tenantId: string, conversationId: string) {
  return `${tenantId}:${conversationId}`;
}

function pendingKey(key: string) {
  return `zap:channel:imessage:input:${Buffer.from(key).toString("base64url")}`;
}
