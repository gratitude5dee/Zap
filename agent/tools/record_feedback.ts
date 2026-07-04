import { defineTool } from "eve/tools";
import { z } from "zod";
import { addFeedbackLedger } from "../../lib/run-ledger.js";

export default defineTool({
  description: "Record a human RLHF vote or note for a Zap run/step.",
  inputSchema: z.object({
    assetId: z.string().optional(),
    comment: z.string().optional(),
    runId: z.string(),
    scores: z.record(z.string(), z.unknown()).default({}),
    stepId: z.string().optional(),
    vote: z.enum(["up", "down", "neutral"]).default("neutral"),
  }),
  async execute(input) {
    const feedbackId = await addFeedbackLedger({
      assetId: input.assetId,
      comment: input.comment,
      kind: "rlhf_vote",
      rater: "human",
      runId: input.runId,
      scores: { ...input.scores, vote: input.vote },
      stepId: input.stepId,
    });
    return { feedbackId, ...input };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Recorded ${output.vote} feedback ${output.feedbackId} for run ${output.runId}${output.stepId ? ` step ${output.stepId}` : ""}.`,
    };
  },
});
