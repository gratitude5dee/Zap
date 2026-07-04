import { defineTool } from "eve/tools";
import { z } from "zod";
import { getZapRunStatus } from "../../lib/zap-runner-server.js";

export default defineTool({
  description: "Wait for a Zap run to advance to a terminal state or the next stage, then return structured status.",
  inputSchema: z.object({
    runId: z.string(),
    timeoutS: z.number().int().min(1).max(300).default(60),
    until: z.enum(["done", "failed", "next_step"]).default("done"),
  }),
  async execute({ runId, timeoutS, until }) {
    const started = Date.now();
    const initial = await getZapRunStatus(runId);
    const initialStage = initial.run?.stage;
    let latest = initial;
    while (Date.now() - started < timeoutS * 1000) {
      latest = await getZapRunStatus(runId);
      const status = latest.run?.status;
      if (until === "done" && (status === "done" || status === "failed" || status === "canceled")) return latest;
      if (until === "failed" && (status === "failed" || status === "canceled")) return latest;
      if (until === "next_step" && latest.run?.stage && latest.run.stage !== initialStage) return latest;
      await sleep(1000);
    }
    return latest;
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Run ${output.run?.runId ?? "unknown"} is ${output.run?.status ?? "unknown"} at ${output.run?.stage ?? "pending"}.`,
    };
  },
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
