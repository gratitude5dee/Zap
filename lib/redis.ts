import { Redis } from "@upstash/redis";

let redis: Redis | null | undefined;
const twoDays = 60 * 60 * 48;
const providerPollQueuePrefix = "zap:poll";
const providerPollDeadLetterKey = `${providerPollQueuePrefix}:dead`;

// Provider queue work must survive a function crash after dequeue. The lease
// is intentionally longer than a normal cron invocation; a later drain moves
// an unacknowledged member back to the ready queue. The deadline is a product
// bound, not a retry-count heuristic: a slow/down provider cannot hold an Air
// admission slot indefinitely just because a cron occasionally succeeds.
export const PROVIDER_POLL_VISIBILITY_LEASE_MS = 5 * 60 * 1000;
export const PROVIDER_POLL_DEADLINE_MS = 60 * 60 * 1000;

type ProviderPollPayload = {
  capability?: string;
  runId?: string;
  stepId?: string;
};

export type ProviderPollJob = ProviderPollPayload & {
  attempts: number;
  createdAtMs: number;
  deadlineAtMs: number;
  provider: string;
  requestId: string;
  // Keep this legacy timestamp so existing inspection tooling and old queued
  // records retain a stable field while new jobs get an explicit deadline.
  ts: number;
};

export type LeasedProviderPollJob = ProviderPollJob & {
  /** Exact Redis ZSET member used to acknowledge or requeue this lease. */
  receipt: string;
};

export function getRedis() {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ token, url }) : null;
  return redis;
}

export async function getIdempotencyKey(key: string) {
  const client = getRedis();
  if (!client) return null;
  return client.get<string>(key);
}

export async function setIdempotencyKey(key: string, value: string) {
  const client = getRedis();
  if (!client) return true;
  const result = await client.set(key, value, { ex: twoDays, nx: true });
  return result === "OK";
}

export async function enqueueProviderPoll(provider: string, requestId: string, payload: ProviderPollPayload = {}) {
  const client = getRedis();
  if (!client) return;
  const now = Date.now();
  const job: ProviderPollJob = {
    attempts: 0,
    capability: payload.capability,
    createdAtMs: now,
    deadlineAtMs: now + PROVIDER_POLL_DEADLINE_MS,
    provider,
    requestId,
    runId: payload.runId,
    stepId: payload.stepId,
    ts: now,
  };
  // Store the serialized job as the list value so Lua can atomically move the
  // exact same member into the visibility ZSET without a crash window.
  await client.lpush(providerPollQueueKey(provider), JSON.stringify(job));
}

export async function dequeueProviderPoll(provider: string) {
  const client = getRedis();
  if (!client) return null;
  const script = client.createScript<string | null>([
    "local job = redis.call('RPOP', KEYS[1])",
    "if not job then return false end",
    "redis.call('ZADD', KEYS[2], ARGV[1], job)",
    "return job",
  ].join("\n"));
  const receipt = await script.eval(
    [providerPollQueueKey(provider), providerPollVisibilityKey(provider)],
    [String(Date.now() + PROVIDER_POLL_VISIBILITY_LEASE_MS)],
  );
  if (typeof receipt !== "string" || !receipt) return null;
  return parseLeasedProviderPollJob(receipt, provider);
}

/** Move expired visibility leases back to the durable ready list. */
export async function recoverProviderPolls(provider: string, limit = 50) {
  const client = getRedis();
  if (!client) return 0;
  const script = client.createScript<string[]>([
    "local jobs = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1], 'LIMIT', '0', ARGV[2])",
    "for _, job in ipairs(jobs) do",
    "  redis.call('ZREM', KEYS[2], job)",
    "  redis.call('LPUSH', KEYS[1], job)",
    "end",
    "return jobs",
  ].join("\n"));
  const recovered = await script.eval(
    [providerPollQueueKey(provider), providerPollVisibilityKey(provider)],
    [String(Date.now()), String(Math.max(1, Math.min(limit, 100)))],
  );
  return Array.isArray(recovered) ? recovered.length : 0;
}

/** Acknowledge a terminal, durably persisted provider result. */
export async function acknowledgeProviderPoll(job: LeasedProviderPollJob) {
  const client = getRedis();
  if (!client) return false;
  return (await client.zrem(providerPollVisibilityKey(job.provider), job.receipt)) === 1;
}

/** Requeue an observed non-terminal result without exposing a dequeue crash window. */
export async function requeueProviderPoll(job: LeasedProviderPollJob) {
  const client = getRedis();
  if (!client) return false;
  const next: ProviderPollJob = {
    ...storedProviderPollJob(job),
    attempts: job.attempts + 1,
    ts: Date.now(),
  };
  const script = client.createScript<number>([
    "if redis.call('ZREM', KEYS[2], ARGV[1]) == 0 then return 0 end",
    "redis.call('RPUSH', KEYS[1], ARGV[2])",
    "return 1",
  ].join("\n"));
  return (await script.eval(
    [providerPollQueueKey(job.provider), providerPollVisibilityKey(job.provider)],
    [job.receipt, JSON.stringify(next)],
  )) === 1;
}

/**
 * Return an already-seen receipt to the front of the ready queue without
 * incrementing attempts. This lets one drain continue to distinct jobs while
 * ensuring a just-requeued request cannot be polled twice in the same pass.
 */
export async function deferProviderPoll(job: LeasedProviderPollJob) {
  const client = getRedis();
  if (!client) return false;
  const script = client.createScript<number>([
    "if redis.call('ZREM', KEYS[2], ARGV[1]) == 0 then return 0 end",
    "redis.call('LPUSH', KEYS[1], ARGV[2])",
    "return 1",
  ].join("\n"));
  return (await script.eval(
    [providerPollQueueKey(job.provider), providerPollVisibilityKey(job.provider)],
    [job.receipt, JSON.stringify(storedProviderPollJob(job))],
  )) === 1;
}

/** Keep terminal jobs inspectable without allowing a stale worker to delete a recovered lease. */
export async function deadLetterProviderPoll(job: LeasedProviderPollJob, error?: string) {
  const client = getRedis();
  if (!client) return false;
  const deadLetter = JSON.stringify({
    error,
    failedAt: Date.now(),
    job: storedProviderPollJob(job),
  });
  const script = client.createScript<number>([
    "if redis.call('ZREM', KEYS[1], ARGV[1]) == 0 then return 0 end",
    "redis.call('LPUSH', KEYS[2], ARGV[2])",
    "return 1",
  ].join("\n"));
  return (await script.eval(
    [providerPollVisibilityKey(job.provider), providerPollDeadLetterKey],
    [job.receipt, deadLetter],
  )) === 1;
}

export function isProviderPollDeadlineExceeded(job: Pick<ProviderPollJob, "deadlineAtMs">, now = Date.now()) {
  return now >= job.deadlineAtMs;
}

function providerPollQueueKey(provider: string) {
  return `${providerPollQueuePrefix}:${provider}`;
}

function providerPollVisibilityKey(provider: string) {
  return `${providerPollQueuePrefix}:visibility:${provider}`;
}

function parseLeasedProviderPollJob(receipt: string, expectedProvider: string): LeasedProviderPollJob | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(receipt);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const legacyPayload = isRecord(value.payload) ? value.payload : {};
  const provider = typeof value.provider === "string" ? value.provider : expectedProvider;
  const requestId = typeof value.requestId === "string" ? value.requestId : undefined;
  if (!requestId || provider !== expectedProvider) return null;
  const createdAtMs = readTimestamp(value.createdAtMs) ?? readTimestamp(value.ts) ?? 0;
  const deadlineAtMs = readTimestamp(value.deadlineAtMs) ?? (createdAtMs > 0 ? createdAtMs + PROVIDER_POLL_DEADLINE_MS : 0);
  return {
    attempts: readAttemptCount(value.attempts),
    capability: readString(value.capability) ?? readString(legacyPayload.capability),
    createdAtMs,
    deadlineAtMs,
    provider,
    receipt,
    requestId,
    runId: readString(value.runId) ?? readString(legacyPayload.runId),
    stepId: readString(value.stepId) ?? readString(legacyPayload.stepId),
    ts: readTimestamp(value.ts) ?? createdAtMs,
  };
}

function storedProviderPollJob(job: LeasedProviderPollJob): ProviderPollJob {
  const { receipt: _receipt, ...stored } = job;
  return stored;
}

function readTimestamp(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function readAttemptCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
