import { defineTool } from "eve/tools";
import { z } from "zod";
import { createZapRunTicket } from "../../lib/zap-runner-server.js";
import { zapBudget } from "../lib/budget.js";

export default defineTool({
  description: "Price and fully plan a Zap without submitting provider work.",
  inputSchema: z.object({
    extendCount: z.number().int().min(0).max(64).default(0),
    inputs: z.record(z.string(), z.unknown()).default({}),
    slug: z.string(),
  }),
  async execute(input) {
    const result = await createZapRunTicket({ ...input, dryRun: true });
    const budget = zapBudget.get();
    return {
      ...result.response,
      remainingSessionBudgetUsd: Math.max(0, budget.capUsd - budget.spentUsd),
      sessionBudgetCapUsd: budget.capUsd,
    };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Quote for ${output.runId}: $${output.quoteUsd.toFixed(2)} across ${output.steps.length} steps. Session remaining before run: $${output.remainingSessionBudgetUsd.toFixed(2)}.`,
    };
  },
});
