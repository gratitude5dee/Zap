import { createHash } from "node:crypto";
import { enqueueProviderPoll, getIdempotencyKey, setIdempotencyKey } from "../redis";
import type { GenRequest, ProviderAdapter, ProviderPollResult } from "../provider-types";
import { listModelRates } from "../pricing";
import { buildProviderWebhookUrl } from "../provider-webhooks";
import { ZapRunError } from "../zap-errors";
import { zapStepKindSchema } from "../zap-schema";
import { falAdapter } from "./fal";
import { gmiAdapter } from "./gmi";
import { mockAdapter } from "./mock";

const adapters: ProviderAdapter[] = [mockAdapter, gmiAdapter, falAdapter];

export async function submitGeneration(req: GenRequest) {
  const adapter = selectAdapter(req);
  const idemKey = buildIdempotencyKey(req);
  const existing = await getIdempotencyKey(idemKey);
  if (existing) {
    return { idemKey, provider: adapter.id, requestId: existing, replayed: true };
  }

  const submitted = await adapter.submit({
    ...req,
    provider: adapter.id,
    webhookUrl: req.webhookUrl ?? buildProviderWebhookUrl(adapter.id, {
      capability: req.capability,
      runId: req.runId,
      stepId: req.stepId,
    }),
  }, idemKey);
  await setIdempotencyKey(idemKey, submitted.requestId);
  await enqueueProviderPoll(adapter.id, submitted.requestId, { capability: req.capability, runId: req.runId, stepId: req.stepId });
  return { idemKey, provider: adapter.id, requestId: submitted.requestId };
}

export async function pollGeneration(provider: string, requestId: string, secrets?: Record<string, string>): Promise<ProviderPollResult> {
  const adapter = adapters.find((candidate) => candidate.id === provider);
  if (!adapter) throw new Error(`Unknown provider ${provider}.`);
  return adapter.poll(requestId, secrets);
}

export function quoteGeneration(req: GenRequest) {
  return selectAdapter(req).price(req);
}

export function listCapabilityManifest({ includeMock = false } = {}) {
  const providers = adapters.filter((adapter) => includeMock || adapter.id !== "mock");
  const pricedModels = listModelRates();
  const generated = providers.flatMap((adapter) =>
    pricedModels.flatMap((rate) =>
      zapStepKindSchema.options
        .filter((capability) => adapter.supports(capability, rate.model))
        .map((capability) => ({
          capability,
          model: rate.model,
          price: rate.perSecond !== undefined
            ? { unit: "second" as const, usd: rate.perSecond }
            : { unit: "request" as const, usd: rate.perRequest ?? 0 },
          provider: adapter.id,
        })),
    ),
  );

  return [
    ...generated,
    { capability: "stitch" as const, model: "ffmpeg", price: { unit: "local" as const, usd: 0 }, provider: "local" },
    { capability: "keyframes" as const, model: "ffmpeg", price: { unit: "local" as const, usd: 0 }, provider: "local" },
  ];
}

function selectAdapter(req: GenRequest) {
  if (process.env.ZAP_PROVIDER === "mock") return mockAdapter;
  const provider = req.provider ?? process.env.ZAP_PROVIDER;
  const preferred = provider ? adapters.find((adapter) => adapter.id === provider) : undefined;
  if (preferred?.supports(req.capability, req.model)) return preferred;
  const fallback = adapters
    .filter((adapter) => adapter.id !== "mock")
    .find((adapter) => adapter.supports(req.capability, req.model));
  if (!fallback) {
    throw new ZapRunError({
      alternatives: adapters
        .filter((adapter) => adapter.supports(req.capability, req.model))
        .map((adapter) => adapter.id),
      code: "PROVIDER_UNSUPPORTED",
      message: `No provider supports ${req.capability} / ${req.model}.`,
      remediation: "Choose a supported model/provider pair or add an adapter capability before submitting the run.",
      retryable: false,
    });
  }
  return fallback;
}

export function buildIdempotencyKey(req: GenRequest) {
  const salt = req.attemptSalt ?? createHash("sha256")
    .update(JSON.stringify({
      capability: req.capability,
      durationS: req.durationS,
      inputs: req.inputs,
      model: req.model,
      prompt: req.prompt,
      provider: req.provider,
    }))
    .digest("hex")
    .slice(0, 16);
  return `zap:idem:${req.runId}:${req.stepId}:${salt}`;
}
