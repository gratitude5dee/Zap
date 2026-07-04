import { defineTool } from "eve/tools";
import { z } from "zod";
import { retryWaitingZapRun } from "../../lib/zap-runner-server.js";

export default defineTool({
  description: "Reject the current waiting Zap candidate, record human feedback, and regenerate that step.",
  inputSchema: z.object({
    comment: z.string().default("Rejected by human review; regenerate."),
    runId: z.string(),
  }),
  approval: () => "user-approval",
  async execute({ comment, runId }) {
    return retryWaitingZapRun(runId, comment);
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Requested regeneration for run ${output.run?.runId ?? "unknown"}; status ${output.run?.status ?? "unknown"} at ${output.run?.stage ?? "pending"}.`,
    };
  },
});
