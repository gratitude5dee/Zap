import { defineTool } from "eve/tools";
import { z } from "zod";
import { compileRun } from "../../lib/compile-run.js";

export default defineTool({
  description: "Compile a completed Zap run trace into a draft Zap.md recipe with actual-cost estimates.",
  inputSchema: z.object({
    runId: z.string(),
    saveDraft: z.boolean().default(false),
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  }),
  approval: ({ toolInput }) => {
    const input = toolInput as { saveDraft?: boolean } | undefined;
    return input?.saveDraft ? "user-approval" : "not-applicable";
  },
  async execute(input) {
    return compileRun(input.runId, { saveDraft: input.saveDraft, slug: input.slug });
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Compiled ${output.runId} into ${output.slug} with estimated cost $${output.estimateUsd.toFixed(2)}${output.path ? ` at ${output.path}` : ""}.`,
    };
  },
});
