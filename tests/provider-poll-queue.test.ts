import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => ({
  lists: new Map<string, string[]>(),
  visibility: new Map<string, Map<string, number>>(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class FakeRedis {
    constructor(_options: unknown) {}

    async lpush(key: string, value: string) {
      const list = redisState.lists.get(key) ?? [];
      list.unshift(value);
      redisState.lists.set(key, list);
      return list.length;
    }

    async zrem(key: string, member: string) {
      const members = redisState.visibility.get(key) ?? new Map<string, number>();
      const removed = members.delete(member) ? 1 : 0;
      redisState.visibility.set(key, members);
      return removed;
    }

    createScript<T>(source: string) {
      return {
        eval: async (keys: string[], args: string[]) => {
          if (source.includes("local job = redis.call('RPOP'")) {
            const list = redisState.lists.get(keys[0]!) ?? [];
            const job = list.pop() ?? null;
            redisState.lists.set(keys[0]!, list);
            if (job) {
              const members = redisState.visibility.get(keys[1]!) ?? new Map<string, number>();
              members.set(job, Number(args[0]));
              redisState.visibility.set(keys[1]!, members);
            }
            return job as T;
          }
          if (source.includes("ZRANGEBYSCORE")) {
            const members = redisState.visibility.get(keys[1]!) ?? new Map<string, number>();
            const recovered = [...members.entries()]
              .filter(([, leaseUntil]) => leaseUntil <= Number(args[0]))
              .sort(([, left], [, right]) => left - right)
              .slice(0, Number(args[1]))
              .map(([member]) => member);
            const list = redisState.lists.get(keys[0]!) ?? [];
            for (const job of recovered) {
              members.delete(job);
              list.unshift(job);
            }
            redisState.visibility.set(keys[1]!, members);
            redisState.lists.set(keys[0]!, list);
            return recovered as T;
          }
          if (source.includes("KEYS[2], ARGV[1]")) {
            const members = redisState.visibility.get(keys[1]!) ?? new Map<string, number>();
            if (!members.delete(args[0]!)) return 0 as T;
            const list = redisState.lists.get(keys[0]!) ?? [];
            list.push(args[1]!);
            redisState.lists.set(keys[0]!, list);
            return 1 as T;
          }
          if (source.includes("KEYS[1], ARGV[1]")) {
            const members = redisState.visibility.get(keys[0]!) ?? new Map<string, number>();
            if (!members.delete(args[0]!)) return 0 as T;
            const list = redisState.lists.get(keys[1]!) ?? [];
            list.unshift(args[1]!);
            redisState.lists.set(keys[1]!, list);
            return 1 as T;
          }
          throw new Error(`Unexpected script: ${source}`);
        },
      };
    }
  },
}));

import {
  PROVIDER_POLL_DEADLINE_MS,
  PROVIDER_POLL_VISIBILITY_LEASE_MS,
  acknowledgeProviderPoll,
  dequeueProviderPoll,
  enqueueProviderPoll,
  isProviderPollDeadlineExceeded,
  recoverProviderPolls,
  requeueProviderPoll,
} from "../lib/redis";

describe("Redis provider poll visibility queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    redisState.lists.clear();
    redisState.visibility.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("moves work through a visibility lease, recovers an interrupted lease, and preserves its hard deadline", async () => {
    await enqueueProviderPoll("gmi", "request_1", {
      capability: "video.gen",
      runId: "air_abcdef012345abcdef012345",
      stepId: "seedance",
    });
    const firstLease = await dequeueProviderPoll("gmi");

    expect(firstLease).toMatchObject({ attempts: 0, provider: "gmi", requestId: "request_1" });
    expect(firstLease?.deadlineAtMs).toBe(Date.now() + PROVIDER_POLL_DEADLINE_MS);
    expect(isProviderPollDeadlineExceeded(firstLease!)).toBe(false);

    await vi.advanceTimersByTimeAsync(PROVIDER_POLL_VISIBILITY_LEASE_MS + 1);
    await expect(recoverProviderPolls("gmi")).resolves.toBe(1);
    const recoveredLease = await dequeueProviderPoll("gmi");

    expect(recoveredLease?.deadlineAtMs).toBe(firstLease?.deadlineAtMs);
    expect(await requeueProviderPoll(recoveredLease!)).toBe(true);
    const retriedLease = await dequeueProviderPoll("gmi");
    expect(retriedLease?.attempts).toBe(1);
    expect(retriedLease?.deadlineAtMs).toBe(firstLease?.deadlineAtMs);
    expect(await acknowledgeProviderPoll(retriedLease!)).toBe(true);
    await expect(recoverProviderPolls("gmi")).resolves.toBe(0);
  });

  it("normalizes pre-lease jobs whose metadata is nested under payload", async () => {
    const queuedAt = Date.now() - 10_000;
    redisState.lists.set("zap:poll:gmi", [JSON.stringify({
      attempts: 4,
      payload: {
        capability: "video.gen",
        runId: "air_abcdef012345abcdef012345",
        stepId: "seedance",
      },
      provider: "gmi",
      requestId: "legacy_request_1",
      ts: queuedAt,
    })]);

    const leased = await dequeueProviderPoll("gmi");

    expect(leased).toMatchObject({
      attempts: 4,
      capability: "video.gen",
      requestId: "legacy_request_1",
      runId: "air_abcdef012345abcdef012345",
      stepId: "seedance",
    });
    expect(leased?.deadlineAtMs).toBe(queuedAt + PROVIDER_POLL_DEADLINE_MS);
  });
});
