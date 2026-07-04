import { defineTool } from "eve/tools";
import { z } from "zod";
import { judgeAsset } from "../../lib/judge.js";

export default defineTool({
  description: "Judge a Zap asset against quality criteria and write a feedback row.",
  inputSchema: z.object({
    assetId: z.string(),
    criteria: z.array(z.string()).min(1).default(["overall_quality"]),
    runId: z.string(),
    stepId: z.string(),
    threshold: z.number().min(0).max(1).default(0.7),
  }),
  async execute(input) {
    return judgeAsset(input);
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Judge ${output.passed ? "passed" : "failed"} for ${output.stepId}: ${output.overall.toFixed(2)} / threshold ${output.threshold.toFixed(2)}. Feedback ${output.feedbackId}.`,
    };
  },
});
