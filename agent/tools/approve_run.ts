import { defineTool } from "eve/tools";
import { z } from "zod";
import { approveWaitingZapRun } from "../../lib/zap-runner-server.js";

export default defineTool({
  description: "Approve a Zap run waiting on a judge gate, record human feedback, and resume from the next step.",
  inputSchema: z.object({
    comment: z.string().default("Approved by human review."),
    runId: z.string(),
  }),
  approval: () => "user-approval",
  async execute({ comment, runId }) {
    return approveWaitingZapRun(runId, comment);
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Approved run ${output.run?.runId ?? "unknown"}; status ${output.run?.status ?? "unknown"} at ${output.run?.stage ?? "pending"}.`,
    };
  },
});
