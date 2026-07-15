import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  addAsset: vi.fn(),
  expiry: vi.fn(),
  failure: vi.fn(),
  persist: vi.fn(),
  release: vi.fn(),
  schedule: vi.fn(),
  snapshot: {
    assets: [] as Array<Record<string, unknown>>,
    run: { costUsd: 0, status: "running" },
    steps: [{ kind: "video.gen", priceQuoteUsd: 1, progress: 0.5, status: "running", stepId: "seedance" }] as Array<Record<string, unknown>>,
  },
  touch: vi.fn(),
  updateRun: vi.fn(),
  upsert: vi.fn(),
  writes: [] as string[],
}));

vi.mock("../lib/blob-store", () => ({
  AirVideoOutputError: class AirVideoOutputError extends Error {
    constructor(message: string, readonly deterministic: boolean) {
      super(message);
    }
  },
  persistAirVideoOutput: (...args: unknown[]) => state.persist(...args),
}));
vi.mock("../lib/air-video-service", () => ({
  recordAirVideoAssetExpiry: (...args: unknown[]) => state.expiry(...args),
  recordAirVideoFailure: (...args: unknown[]) => state.failure(...args),
  releaseAirVideoConcurrency: (...args: unknown[]) => state.release(...args),
  scheduleAirVideoAssetCleanup: (...args: unknown[]) => state.schedule(...args),
  touchAirVideoConcurrency: (...args: unknown[]) => state.touch(...args),
}));
vi.mock("../lib/redis", () => ({
  getRedis: () => ({ set: async () => "OK" }),
}));
vi.mock("../lib/run-ledger", () => ({
  addAssetLedger: (...args: unknown[]) => state.addAsset(...args),
  getRunSnapshot: async () => ({ ...state.snapshot }),
  updateRunLedger: (...args: unknown[]) => state.updateRun(...args),
  upsertStepLedger: (...args: unknown[]) => state.upsert(...args),
}));
vi.mock("@wzrdtech/providers", () => ({
  getProviderAdapter: () => ({}),
}));

import { recordProviderProgress } from "../lib/provider-webhooks";

const runId = "air_abcdef012345abcdef012345";

describe("Air provider output persistence", () => {
  beforeEach(() => {
    state.snapshot = {
      assets: [],
      run: { costUsd: 0, status: "running" },
      steps: [{ kind: "video.gen", priceQuoteUsd: 1, progress: 0.5, status: "running", stepId: "seedance" }],
    };
    state.writes.length = 0;
    state.addAsset.mockReset().mockImplementation(async () => {
      state.writes.push("ledger-asset");
      return "asset_1";
    });
    state.expiry.mockReset().mockImplementation(async () => {
      state.writes.push("record-expiry");
    });
    state.failure.mockReset();
    state.release.mockReset();
    state.schedule.mockReset().mockImplementation(async () => {
      state.writes.push("cleanup-scheduled");
    });
    state.touch.mockReset();
    state.updateRun.mockReset();
    state.upsert.mockReset().mockImplementation(async (step: Record<string, unknown>) => {
      state.snapshot.steps = [step];
    });
    state.persist.mockReset().mockImplementation(async (
      _url: string,
      _key: string,
      options: { beforeBlobWrite: (storageKey: string) => Promise<void> },
    ) => {
      await options.beforeBlobWrite(`air/${runId}/seedance.mp4`);
      state.writes.push("blob-written");
      return {
        storageKey: `air/${runId}/seedance.mp4`,
        url: "https://blob.example/air/video.mp4",
      };
    });
  });

  it("schedules cleanup before Blob persistence, then records the matching expiry before terminal state", async () => {
    await expect(recordProviderProgress("gmi", {
      outputUrl: "https://storage.googleapis.com/gmi/video.mp4",
      progress: 1,
      status: "done",
    }, {
      capability: "video.gen",
      requestId: "gmi_request_1",
      runId,
      stepId: "seedance",
    })).resolves.toMatchObject({ observed: true, status: "done" });

    expect(state.writes).toEqual([
      "cleanup-scheduled",
      "blob-written",
      "ledger-asset",
      "record-expiry",
    ]);
    expect(state.schedule).toHaveBeenCalledWith(`air/${runId}/seedance.mp4`, expect.any(Number));
    expect(state.expiry).toHaveBeenCalledWith(runId, expect.any(Number));
    expect(state.failure).not.toHaveBeenCalled();
  });
});
