import type { ZapStep } from "./zap-schema";
import { ZapRunError } from "./zap-errors";

export const modelRates: Record<string, { perSecond?: number; perRequest?: number }> = {
  "fal-ai/flux/dev": { perRequest: 0.03 },
  "fal-ai/kling-video/v2.1/pro/image-to-video": { perSecond: 0.28 },
  "fal-ai/veo3.1": { perSecond: 0.45 },
  "gemini-omni-flash-preview": { perSecond: 0.1 },
  "happyhorse-1.1-i2v": { perSecond: 0.28 },
  "seedance-2-0-260128": { perSecond: 0.07 },
  "seedance-2-0-260128-upscale": { perSecond: 0.056 },
};

export function quoteStep(step: ZapStep) {
  const model = step.model ?? "local";
  const rate = modelRates[model];
  if (!rate) {
    throw new ZapRunError({
      alternatives: Object.keys(modelRates).slice(0, 5),
      code: "UNKNOWN_MODEL",
      message: `No pricing is configured for model ${model}.`,
      remediation: "Add this model to lib/pricing.ts or choose a model with known pricing before submitting paid work.",
      retryable: false,
    });
  }
  if (rate.perRequest !== undefined) return rate.perRequest;
  return (rate.perSecond ?? 0) * (step.duration_s ?? 1);
}

export function listModelRates() {
  return Object.entries(modelRates).map(([model, rate]) => ({ model, ...rate }));
}
