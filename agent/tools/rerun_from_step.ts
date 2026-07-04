import { defineTool } from "eve/tools";
import { z } from "zod";
import { rerunZapRunFromStep } from "../../lib/zap-runner-server.js";

export default defineTool({
  description: "Re-run a Zap from a specific step and replay all downstream steps using the durable ledger.",
  inputSchema: z.object({
    comment: z.string().default("Re-run from this step after human review."),
    runId: z.string(),
    stepId: z.string(),
  }),
  approval: () => "user-approval",
  async execute({ comment, runId, stepId }) {
    return rerunZapRunFromStep(runId, stepId, comment);
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Re-run requested for ${output.run?.runId ?? "unknown"}; status ${output.run?.status ?? "unknown"} at ${output.run?.stage ?? "pending"}.`,
    };
  },
});
