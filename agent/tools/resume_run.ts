import { defineTool } from "eve/tools";
import { z } from "zod";
import { resumeZapRun } from "../../lib/zap-runner-server.js";

export default defineTool({
  description: "Resume a failed or canceled Zap run from the first unfinished step using the durable run ledger.",
  inputSchema: z.object({
    runId: z.string(),
  }),
  async execute({ runId }) {
    return resumeZapRun(runId);
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Run ${output.run?.runId ?? "unknown"} resumed: ${output.run?.status ?? "unknown"} at ${output.run?.stage ?? "pending"}.`,
    };
  },
});
