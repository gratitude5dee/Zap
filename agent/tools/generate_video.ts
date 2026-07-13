import { defineTool } from "eve/tools";
import { z } from "zod";
import { submitGeneration } from "../../lib/providers/router.js";
import { assertPaidToolSession } from "../../lib/channel-run-context.js";

export default defineTool({
  description: "Submit a video generation or extension request through the Zap provider router.",
  inputSchema: z.object({
    durationS: z.number().positive().default(15),
    imageUrl: z.string().url().optional(),
    kind: z.enum(["video.gen", "video.extend"]).default("video.gen"),
    model: z.string().default("seedance-2-0-260128"),
    prompt: z.string().min(1),
    provider: z.enum(["gmi", "fal", "prodia", "runware"]).optional(),
    runId: z.string(),
    stepId: z.string(),
  }),
  approval: () => "user-approval",
  async execute(input, ctx) {
    assertPaidToolSession(ctx.session.auth);
    return submitGeneration({
      capability: input.kind,
      durationS: input.durationS,
      inputs: { imageUrl: input.imageUrl },
      model: input.model,
      prompt: input.prompt,
      provider: input.provider ?? "gmi",
      runId: input.runId,
      stepId: input.stepId,
    });
  },
  toModelOutput(output) {
    return { type: "text", value: `${output.provider} video request ${output.requestId}` };
  },
});
