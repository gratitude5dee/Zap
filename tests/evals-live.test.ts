import { describe, expect, it } from "vitest";
import {
  isLiveEvalEnabled,
  resolveLiveAssetFixture,
  resolveLiveJudgeModel,
} from "../evals/live/runtime";

describe("live eval configuration", () => {
  it("requires an explicit EVALS_LIVE=1 opt-in", () => {
    expect(isLiveEvalEnabled({})).toBe(false);
    expect(isLiveEvalEnabled({ EVALS_LIVE: "true" })).toBe(false);
    expect(isLiveEvalEnabled({ EVALS_LIVE: " 1 " })).toBe(true);
  });

  it("resolves a separate judge model without requiring CI credentials", () => {
    expect(resolveLiveJudgeModel({})).toBe("google/gemini-2.5-flash");
    expect(resolveLiveJudgeModel({ ZAP_JUDGE_MODEL: "openai/gpt-5.4-mini" })).toBe("openai/gpt-5.4-mini");
    expect(resolveLiveJudgeModel({
      EVALS_JUDGE_MODEL: "anthropic/claude-haiku-4.5",
      ZAP_JUDGE_MODEL: "openai/gpt-5.4-mini",
    })).toBe("anthropic/claude-haiku-4.5");
  });

  it("requires a complete persisted sample-asset reference", () => {
    expect(resolveLiveAssetFixture({})).toBeUndefined();
    expect(resolveLiveAssetFixture({
      EVALS_LIVE_ASSET_ID: "asset_123",
      EVALS_LIVE_RUN_ID: "run_123",
      EVALS_LIVE_STEP_ID: "initial_gen",
    })).toEqual({ assetId: "asset_123", runId: "run_123", stepId: "initial_gen" });
    expect(() => resolveLiveAssetFixture({ EVALS_LIVE_ASSET_ID: "asset_123" }))
      .toThrow(/must be set together/i);
  });
});
