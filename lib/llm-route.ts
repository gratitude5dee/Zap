import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";

export const LLM_ROUTES = ["gateway", "openai", "anthropic", "openrouter"] as const;

export type LlmRoute = (typeof LLM_ROUTES)[number];
export type LlmRouteEnv = Readonly<Record<string, string | undefined>>;

export type LlmRouteSelection = {
  modelId: string;
  route: LlmRoute;
};

export type LlmPurpose = "judge" | "aura";

export type LlmModelFactoryInput = LlmRouteSelection & {
  apiKey?: string;
};

export type LlmModelFactory = (input: LlmModelFactoryInput) => LanguageModel | Promise<LanguageModel>;

export type CreateLlmModelOptions = {
  env?: LlmRouteEnv;
  factories?: Partial<Record<LlmRoute, LlmModelFactory>>;
};

const defaultModels: Record<LlmRoute, string> = {
  anthropic: "claude-sonnet-4-6",
  gateway: "anthropic/claude-sonnet-4.6",
  openai: "gpt-5.4",
  openrouter: "anthropic/claude-sonnet-4.6",
};

const purposeDefaultModels: Record<LlmPurpose, Record<LlmRoute, string>> = {
  aura: {
    anthropic: "claude-sonnet-4-6",
    gateway: "google/gemini-3.5-flash",
    openai: "gpt-5.4",
    openrouter: "google/gemini-3.5-flash",
  },
  judge: {
    anthropic: "claude-sonnet-4-6",
    gateway: "google/gemini-2.5-flash",
    openai: "gpt-5.4",
    openrouter: "google/gemini-2.5-flash",
  },
};

const routeModelEnv: Record<LlmRoute, string> = {
  anthropic: "ZAP_LLM_ANTHROPIC_MODEL",
  gateway: "ZAP_LLM_GATEWAY_MODEL",
  openai: "ZAP_LLM_OPENAI_MODEL",
  openrouter: "ZAP_LLM_OPENROUTER_MODEL",
};

const routeCredentialEnv: Partial<Record<LlmRoute, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

/** Resolve routing metadata without loading or contacting a provider. */
export function resolveLlmRoute(
  env: LlmRouteEnv = process.env,
  modelOverride?: string,
): LlmRouteSelection {
  const rawRoute = env.ZAP_LLM_ROUTE?.trim().toLowerCase() || "gateway";
  if (!isLlmRoute(rawRoute)) {
    throw new Error(`ZAP_LLM_ROUTE must be one of ${LLM_ROUTES.join(", ")}; received ${rawRoute}.`);
  }

  const modelId = firstNonEmpty(
    modelOverride,
    env[routeModelEnv[rawRoute]],
    env.ZAP_LLM_MODEL,
    defaultModels[rawRoute],
  );
  return { modelId, route: rawRoute };
}

export function defaultLlmModelForRoute(route: LlmRoute) {
  return defaultModels[route];
}

/** Resolve judge/Aura models without leaking gateway-style ids into direct providers. */
export function resolveLlmPurposeRoute(
  purpose: LlmPurpose,
  env: LlmRouteEnv = process.env,
): LlmRouteSelection {
  const route = resolveLlmRoute(env).route;
  const routeSpecificKey = `ZAP_${purpose.toUpperCase()}_${route.toUpperCase()}_MODEL`;
  const legacyKey = `ZAP_${purpose.toUpperCase()}_MODEL`;
  const legacyModel = route === "gateway" || route === "openrouter" ? env[legacyKey] : undefined;
  return {
    modelId: firstNonEmpty(env[routeSpecificKey], legacyModel, purposeDefaultModels[purpose][route]),
    route,
  };
}

export function assertLlmModelCompatible(selection: LlmRouteSelection) {
  if ((selection.route === "openai" || selection.route === "anthropic") && selection.modelId.includes("/")) {
    throw new Error(`${selection.route} direct routing requires a provider-native model id without a provider prefix; received ${selection.modelId}.`);
  }
  return selection;
}

/** Create the selected AI SDK model. Direct routes require their provider key. */
export async function createLlmModel(
  selection: LlmRouteSelection = resolveLlmRoute(),
  options: CreateLlmModelOptions = {},
): Promise<LanguageModel> {
  const env = options.env ?? process.env;
  const credentialEnv = routeCredentialEnv[selection.route];
  const apiKey = credentialEnv ? env[credentialEnv]?.trim() : undefined;
  if (credentialEnv && !apiKey) {
    throw new Error(`${credentialEnv} is required when ZAP_LLM_ROUTE=${selection.route}.`);
  }

  assertLlmModelCompatible(selection);
  const factory = options.factories?.[selection.route] ?? defaultFactory(selection.route);
  return await factory({ ...selection, apiKey });
}

function defaultFactory(route: LlmRoute): LlmModelFactory {
  switch (route) {
    case "gateway":
      return ({ modelId }) => gateway(modelId);
    case "openai":
      return ({ apiKey, modelId }) => createOpenAI({ apiKey })(modelId);
    case "openrouter":
      return ({ apiKey, modelId }) => createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        name: "openrouter",
      }).chat(modelId);
    case "anthropic":
      return createAnthropicModel;
  }
}

function createAnthropicModel({ apiKey, modelId }: LlmModelFactoryInput): LanguageModel {
  return createAnthropic({ apiKey })(modelId);
}

function isLlmRoute(value: string): value is LlmRoute {
  return (LLM_ROUTES as readonly string[]).includes(value);
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  throw new Error("An LLM model id is required.");
}
