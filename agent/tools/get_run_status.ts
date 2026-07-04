import { defineTool } from "eve/tools";
import { z } from "zod";
import { getZapRunStatus } from "../../lib/zap-runner-server.js";
import { zapBudget } from "../lib/budget.js";

export default defineTool({
  description: "Return structured status, step progress, costs, and assets for a Zap run.",
  inputSchema: z.object({ runId: z.string() }),
  async execute({ runId }) {
    const status = await getZapRunStatus(runId);
    const run = status.run;
    if (run) {
      zapBudget.update((current) => {
        const existing = current.runs[runId] ?? { quoteUsd: run.costUsd, status: run.status };
        const runs = {
          ...current.runs,
          [runId]: {
            ...existing,
            actualUsd: run.status === "done" || run.status === "failed" || run.status === "canceled"
              ? run.costUsd
              : existing.actualUsd,
            status: run.status,
          },
        };
        return {
          ...current,
          currentRunId: runId,
          runs,
          spentUsd: totalBudgetSpent(runs),
        };
      });
    }
    return status;
  },
  toModelOutput(output) {
    const status = output.run?.status ?? "unknown";
    const stage = output.run?.stage ?? "pending";
    const cost = output.run?.costUsd ?? 0;
    const remaining = output.remainingBudgetUsd === undefined
      ? "unknown"
      : `$${output.remainingBudgetUsd.toFixed(2)}`;
    const steps = output.steps
      .map((step) => `${step.stepId}:${step.status}:${Math.round((step.progress ?? 0) * 100)}%`)
      .join(", ");
    const assets = output.assets
      .map((asset) => asset._id ?? `${asset.runId}:${asset.stepId}`)
      .join(", ");
    const judge = output.feedback
      .filter((entry) => entry.kind === "judge_score")
      .map((entry) => {
        const scores = entry.scores as { overall?: number; passed?: boolean };
        return `${entry.stepId}:${scores.passed ? "pass" : "fail"}:${typeof scores.overall === "number" ? scores.overall.toFixed(2) : "n/a"}`;
      })
      .join(", ");
    return {
      type: "text",
      value: `Run ${output.run?.runId ?? "unknown"} ${status} at ${stage}. Cost $${cost.toFixed(2)}, remaining ${remaining}. Steps: ${steps || "none"}. Assets: ${assets || "none"}. Judge: ${judge || "none"}. Use get_asset for URLs.`,
    };
  },
});

function totalBudgetSpent(runs: Record<string, { actualUsd?: number; quoteUsd: number }>) {
  return Object.values(runs).reduce((sum, run) => sum + (run.actualUsd ?? run.quoteUsd), 0);
}
