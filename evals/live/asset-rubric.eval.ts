import { defineEval } from "eve/evals";
import {
  isLiveEvalEnabled,
  resolveLiveAssetFixture,
  resolveLiveJudgeModel,
} from "./runtime";

const rubricCriteria = [
  "identity_consistency",
  "pacing",
  "prompt_adherence",
  "artifact_control",
];

export default defineEval({
  description: "Run the target's real judge_asset rubric against a persisted generated output.",
  judge: { model: resolveLiveJudgeModel() },
  metadata: { fixture: "persisted-asset", spend: "visual-judge-and-llm-judge" },
  tags: ["live", "judge", "asset"],
  timeoutMs: 180_000,
  async test(t) {
    if (!isLiveEvalEnabled()) {
      t.skip("Live visual and text judge calls require EVALS_LIVE=1.");
      return;
    }

    const fixture = resolveLiveAssetFixture();
    if (!fixture) {
      t.skip(
        "Set EVALS_LIVE_ASSET_ID, EVALS_LIVE_RUN_ID, and EVALS_LIVE_STEP_ID to grade a persisted output.",
      );
      return;
    }

    const turn = await t.send([
      "This is a live visual-judge regression eval.",
      `Call judge_asset exactly once for asset ${fixture.assetId}, run ${fixture.runId}, step ${fixture.stepId}.`,
      `Use threshold 0.7 and criteria ${rubricCriteria.join(", ")}.`,
      "Report the numerical score, threshold, and pass/fail result concisely.",
    ].join("\n"));

    t.succeeded();
    t.noFailedActions();
    t.calledTool("judge_asset", {
      count: 1,
      input: {
        assetId: fixture.assetId,
        criteria: rubricCriteria,
        runId: fixture.runId,
        stepId: fixture.stepId,
        threshold: 0.7,
      },
    });
    t.judge.autoevals.closedQA(
      "The response reports the visual judge's numerical score, the 0.7 threshold, and the resulting pass/fail decision without inventing an asset URL.",
      { on: turn.message },
    ).atLeast(0.7);
  },
});
