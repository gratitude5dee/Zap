import { defineTool } from "eve/tools";
import { z } from "zod";
import { cancelZapRun } from "../../lib/zap-runner-server.js";

export default defineTool({
  description: "Cancel a queued or running Zap run and mark unfinished steps canceled.",
  inputSchema: z.object({
    reason: z.string().default("Canceled by user or agent request."),
    runId: z.string(),
  }),
  async execute({ reason, runId }) {
    return cancelZapRun(runId, reason);
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Run ${output.run?.runId ?? "unknown"} ${output.run?.status ?? "unknown"} at ${output.run?.stage ?? "pending"}.`,
    };
  },
});
