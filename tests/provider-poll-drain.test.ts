import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeasedProviderPollJob } from "../lib/redis";

const state = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  cleanup: vi.fn(),
  deadLetter: vi.fn(),
  defer: vi.fn(),
  dequeue: vi.fn(),
  poll: vi.fn(),
  record: vi.fn(),
  recover: vi.fn(),
  requeue: vi.fn(),
}));

vi.mock("@/lib/air-video-service", () => ({
  cleanupExpiredAirVideoAssets: (...args: unknown[]) => state.cleanup(...args),
}));
vi.mock("@/lib/provider-webhooks", () => ({
  recordProviderProgress: (...args: unknown[]) => state.record(...args),
}));
vi.mock("@/lib/redis", () => ({
  acknowledgeProviderPoll: (...args: unknown[]) => state.acknowledge(...args),
  deadLetterProviderPoll: (...args: unknown[]) => state.deadLetter(...args),
  deferProviderPoll: (...args: unknown[]) => state.defer(...args),
  dequeueProviderPoll: (...args: unknown[]) => state.dequeue(...args),
  isProviderPollDeadlineExceeded: (job: { deadlineAtMs: number }) => Date.now() >= job.deadlineAtMs,
  recoverProviderPolls: (...args: unknown[]) => state.recover(...args),
  requeueProviderPoll: (...args: unknown[]) => state.requeue(...args),
}));
vi.mock("@/lib/providers/router", () => ({
  pollGeneration: (...args: unknown[]) => state.poll(...args),
}));
vi.mock("@/lib/run-ledger", () => ({
  getRunSnapshot: async () => ({ run: { userId: "owner_1" } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  revealZapSecretsForProviderByUserId: async () => ({ gmi_api_key: "test-key" }),
}));
vi.mock("@wzrdtech/providers", () => ({
  listProviderAdapters: () => [{ id: "gmi" }],
}));

import { POST } from "../app/api/providers/poll/drain/route";

function job(overrides: Partial<LeasedProviderPollJob> = {}): LeasedProviderPollJob {
  const now = Date.now();
  return {
    attempts: 0,
    capability: "video.gen",
    createdAtMs: now,
    deadlineAtMs: now + 60 * 60 * 1000,
    provider: "gmi",
    receipt: "receipt-1",
    requestId: "gmi_request_1",
    runId: "air_abcdef012345abcdef012345",
    stepId: "seedance",
    ts: now,
    ...overrides,
  };
}

describe("provider poll drain durability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    vi.stubEnv("ZAP_POLL_DRAIN_SECRET", "cron-secret");
    state.acknowledge.mockReset().mockResolvedValue(true);
    state.cleanup.mockReset().mockResolvedValue(0);
    state.deadLetter.mockReset().mockResolvedValue(true);
    state.defer.mockReset().mockResolvedValue(true);
    state.dequeue.mockReset().mockResolvedValue(null);
    state.poll.mockReset().mockResolvedValue({ progress: 0.5, status: "running" });
    state.record.mockReset().mockResolvedValue({ observed: true });
    state.recover.mockReset().mockResolvedValue(0);
    state.requeue.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("recovers visibility leases and retries an observed non-terminal job without an attempt cutoff", async () => {
    const leased = job({ attempts: 9_999 });
    state.dequeue.mockResolvedValueOnce(leased).mockResolvedValueOnce(null);

    const response = await POST(new Request("https://zap.test/api/providers/poll/drain", {
      headers: { "x-zap-cron-secret": "cron-secret" },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(state.recover).toHaveBeenCalledWith("gmi");
    expect(state.poll).toHaveBeenCalledWith("gmi", leased.requestId, { gmi_api_key: "test-key" });
    expect(state.requeue).toHaveBeenCalledWith(leased);
    expect(state.deadLetter).not.toHaveBeenCalled();
    expect(state.acknowledge).not.toHaveBeenCalled();
  });

  it("enforces the absolute 60-minute deadline before a further provider poll", async () => {
    const expired = job({ deadlineAtMs: Date.now() - 1 });
    state.dequeue.mockResolvedValueOnce(expired).mockResolvedValueOnce(null);

    const response = await POST(new Request("https://zap.test/api/providers/poll/drain", {
      headers: { "x-zap-cron-secret": "cron-secret" },
      method: "POST",
    }));
    const payload = await response.json() as { results: Array<{ status: string }> };

    expect(response.status).toBe(200);
    expect(state.poll).not.toHaveBeenCalled();
    expect(state.record).toHaveBeenCalledWith("gmi", {
      error: "POLL_DEADLINE_EXCEEDED",
      progress: 1,
      status: "failed",
    }, {
      capability: expired.capability,
      requestId: expired.requestId,
      runId: expired.runId,
      stepId: expired.stepId,
    });
    expect(state.deadLetter).toHaveBeenCalledWith(expired, "Poll deadline exceeded.");
    expect(payload.results).toEqual([{ provider: "gmi", requestId: expired.requestId, status: "failed" }]);
  });

  it("does not poll a requeued non-terminal request twice while still draining a distinct request", async () => {
    const first = job({ receipt: "receipt-a-first", requestId: "gmi_request_a" });
    const repeated = job({ attempts: 1, receipt: "receipt-a-requeued", requestId: "gmi_request_a" });
    const distinct = job({ receipt: "receipt-b-first", requestId: "gmi_request_b" });
    state.dequeue
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(repeated)
      .mockResolvedValueOnce(distinct)
      .mockResolvedValueOnce(null);

    const response = await POST(new Request("https://zap.test/api/providers/poll/drain", {
      headers: { "x-zap-cron-secret": "cron-secret" },
      method: "POST",
    }));
    const payload = await response.json() as { results: Array<{ requestId: string; status: string }> };

    expect(response.status).toBe(200);
    expect(state.poll.mock.calls.map((call) => call[1])).toEqual(["gmi_request_a", "gmi_request_b"]);
    expect(state.defer).toHaveBeenCalledWith(repeated);
    expect(state.requeue).toHaveBeenCalledWith(first);
    expect(state.requeue).toHaveBeenCalledWith(distinct);
    expect(payload.results).toEqual([
      { provider: "gmi", requestId: "gmi_request_a", status: "running" },
      { provider: "gmi", requestId: "gmi_request_b", status: "running" },
    ]);
  });
});
