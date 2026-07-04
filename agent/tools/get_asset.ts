import { defineTool } from "eve/tools";
import { z } from "zod";
import { getAssetSnapshot } from "../../lib/run-ledger.js";
import { ZapRunError } from "../../lib/zap-errors.js";

export default defineTool({
  description: "Resolve a Zap asset handle to URL, type, parents, and media metadata on demand.",
  inputSchema: z.object({
    assetId: z.string(),
  }),
  async execute({ assetId }) {
    const asset = await getAssetSnapshot(assetId);
    if (!asset) {
      throw new ZapRunError({
        code: "RUN_NOT_FOUND",
        message: `Asset ${assetId} was not found.`,
        remediation: "Call get_run_status for the run and use one of the returned asset handles.",
        retryable: false,
      });
    }
    return asset;
  },
  toModelOutput(asset) {
    return {
      type: "json",
      value: {
        assetId: asset._id,
        durationS: asset.durationS,
        height: asset.height,
        kind: asset.kind,
        parents: asset.parents,
        runId: asset.runId,
        stepId: asset.stepId,
        url: asset.url,
        width: asset.width,
      },
    };
  },
});
