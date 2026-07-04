import { describe, expect, it } from "vitest";
import { addAssetLedger, createRunLedger, getRunSnapshot } from "../lib/run-ledger";
import { judgeAsset } from "../lib/judge";

describe("judge asset", () => {
  it("records deterministic fallback scoring as heuristic feedback", async () => {
    const runId = `run_judge_${Date.now()}`;
    const stepId = "initial_gen";

    await createRunLedger({
      inputs: {},
      runId,
      zapSlug: "judge-demo",
      zapVersion: 1,
    });
    const assetId = await addAssetLedger({
      kind: "mp4",
      parents: [],
      runId,
      stepId,
      url: "mock://provider/judge-demo.mp4",
    });

    const result = await judgeAsset({
      assetId,
      criteria: ["identity_consistency", "pacing"],
      runId,
      stepId,
      threshold: 0.7,
    });

    const snapshot = await getRunSnapshot(runId);
    const feedback = snapshot.feedback.find((entry) => entry._id === result.feedbackId);
    expect(result.mode).toBe("heuristic");
    expect(result.passed).toBe(true);
    expect(feedback?.rater).toBe("heuristic");
    expect(feedback?.scores).toMatchObject({ mode: "heuristic" });
  });
});
