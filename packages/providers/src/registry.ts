import type { Capability, ProviderAdapter, ProviderId } from "./types.ts";
import { awsAdapter } from "./aws.ts";
import { falAdapter } from "./fal.ts";
import { gmiAdapter } from "./gmi.ts";
import { prodiaAdapter } from "./prodia.ts";
import { runwareAdapter } from "./runware.ts";
import { vertexAdapter } from "./vertex.ts";

export const providerAdapters: Record<ProviderId, ProviderAdapter> = {
  aws: awsAdapter,
  fal: falAdapter,
  gmi: gmiAdapter,
  prodia: prodiaAdapter,
  runware: runwareAdapter,
  vertex: vertexAdapter,
};

export function getProviderAdapter(provider: string) {
  return providerAdapters[provider as ProviderId];
}

export function defaultModelFor(provider: ProviderId, capability: Capability) {
  return providerAdapters[provider].defaultModel(capability);
}

export function listProviderAdapters() {
  return Object.values(providerAdapters);
}
