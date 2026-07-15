import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  drain: vi.fn(),
}));

vi.mock("@/lib/provider-poll-drain", () => ({
  drainProviderPollQueue: (...args: unknown[]) => state.drain(...args),
}));

import { GET } from "../app/api/cron/provider-poll/route";

describe("Vercel provider-poll cron", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "vercel-cron-secret");
    state.drain.mockReset().mockResolvedValue({ cleanedAssets: 0, drained: 0, results: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed before draining without Vercel's bearer secret", async () => {
    const response = await GET(new Request("https://zap.test/api/cron/provider-poll"));

    expect(response.status).toBe(401);
    expect(state.drain).not.toHaveBeenCalled();
  });

  it("runs one bounded drain only for the expected bearer secret", async () => {
    const response = await GET(new Request("https://zap.test/api/cron/provider-poll", {
      headers: { authorization: "Bearer vercel-cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cleanedAssets: 0, drained: 0, results: [] });
    expect(state.drain).toHaveBeenCalledTimes(1);
  });
});
