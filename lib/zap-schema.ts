import { parseDocument } from "yaml";
import { z } from "zod";
import { ZapRunError } from "./zap-errors";

export const zapInputSchema = z.object({
  hint: z.string().optional(),
  label: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
  type: z.enum(["string", "textarea", "image", "video", "select", "number"]),
});

export const zapStepKindSchema = z.enum([
  "image.gen",
  "image.edit",
  "video.gen",
  "video.extend",
  "video.edit",
  "video.upscale",
  "audio.tts",
  "audio.music",
  "audio.sfx",
  "keyframes",
  "stitch",
]);

export const zapStepSchema = z.object({
  audio: z.record(z.string(), z.unknown()).optional(),
  candidates: z.number().int().min(1).max(16).optional(),
  duration_s: z.number().positive().optional(),
  extend: z.object({ mode: z.enum(["chain", "anchored"]).default("chain") }).optional(),
  first_frame: z.record(z.string(), z.unknown()).optional(),
  id: z.string().min(1),
  inputs: z.array(z.string()).optional(),
  judge: z.record(z.string(), z.unknown()).optional(),
  keyframes: z.record(z.string(), z.unknown()).optional(),
  kind: zapStepKindSchema,
  model: z.string().optional(),
  prompt: z.string().optional(),
  provider: z.string().optional(),
  reference_images: z.array(z.string()).optional(),
  repeat: z.object({
    default: z.number().int().min(0).optional(),
    max: z.number().int().min(0).max(64).optional(),
    min: z.number().int().min(0).optional(),
  }).optional(),
  retry: z.object({
    backoff_s: z.number().min(0).max(300).default(0),
    fallback_model: z.string().optional(),
    fallback_provider: z.string().optional(),
    max: z.number().int().min(0).max(8).default(0),
  }).optional(),
  rlhf: z.union([z.literal("optional"), z.boolean()]).optional(),
  shared: z.boolean().optional(),
  stitch: z.object({
    engine: z.enum(["auto", "local", "hyperframes"]).default("auto"),
    fps: z.number().int().min(1).max(120).optional(),
    format: z.enum(["mp4", "webm"]).default("mp4"),
    quality: z.enum(["draft", "standard", "high"]).default("standard"),
  }).optional(),
  tier: z.enum(["draft", "final"]).optional(),
});

export const zapSpecSchema = z.object({
  budget: z.object({
    cap_usd: z.number().positive(),
    estimate_usd: z.number().nonnegative(),
  }),
  defaults: z.object({
    aspect: z.string().optional(),
    provider: z.string().default("gmi"),
  }).default({ provider: "gmi" }),
  description: z.string(),
  inputs: z.record(z.string(), zapInputSchema).default({}),
  output: z.string().default("Zap.mp4"),
  steps: z.array(zapStepSchema).min(1),
  version: z.number().int().positive(),
  zap: z.string().min(1),
});

export type ZapInput = z.infer<typeof zapInputSchema>;
export type ZapStep = z.infer<typeof zapStepSchema>;
export type ZapSpec = z.infer<typeof zapSpecSchema>;
export type PublicZapSpec = ZapSpec & { title: string };

export function parseZapMarkdown(markdown: string): ZapSpec {
  const frontmatter = extractFrontmatter(markdown);
  const parsed = parseDocument(frontmatter).toJS();
  const spec = zapSpecSchema.parse(parsed);
  validateSpec(spec);
  return spec;
}

export function validateZapPromptTemplates(spec: ZapSpec, promptContents: Record<string, string>) {
  for (const step of spec.steps) {
    const promptRef = step.prompt;
    if (!promptRef || !isPromptFile(promptRef)) continue;
    const content = promptContents[promptRef];
    if (content === undefined) {
      throw new ZapRunError({
        code: "SCHEMA_INVALID",
        message: `Step ${step.id} references missing prompt file ${promptRef}.`,
        remediation: "Create the prompt file or update the step.prompt path before running the Zap.",
        retryable: false,
      });
    }
    validateTemplateVariables(spec, step.id, content);
  }
}

export function publicZapSpec(spec: ZapSpec): PublicZapSpec {
  return { ...spec, title: titleize(spec.zap) };
}

function extractFrontmatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("Zap recipe is missing YAML frontmatter.");
  }
  return match[1];
}

function validateSpec(spec: ZapSpec) {
  validateDuplicateStepIds(spec);
  validateStepRefs(spec);
  validateVideoDurations(spec);
  validateInlineVariables(spec);
}

function validateInlineVariables(spec: ZapSpec) {
  const declared = new Set(Object.keys(spec.inputs));
  for (const step of spec.steps) {
    const promptRef = step.prompt ?? "";
    if (!isPromptFile(promptRef)) validateTemplateVariables(spec, step.id, promptRef, declared);
  }
}

function validateDuplicateStepIds(spec: ZapSpec) {
  const seen = new Set<string>();
  for (const step of spec.steps) {
    if (seen.has(step.id)) throw new Error(`Duplicate step id ${step.id}.`);
    seen.add(step.id);
  }
}

function validateStepRefs(spec: ZapSpec) {
  const declaredInputs = new Set(Object.keys(spec.inputs));
  const priorSteps = new Set<string>();
  for (const step of spec.steps) {
    for (const ref of [...(step.inputs ?? []), ...(step.reference_images ?? [])]) {
      validateRef({ declaredInputs, priorSteps, ref, stepId: step.id });
    }
    priorSteps.add(step.id);
  }
}

function validateRef({
  declaredInputs,
  priorSteps,
  ref,
  stepId,
}: {
  declaredInputs: Set<string>;
  priorSteps: Set<string>;
  ref: string;
  stepId: string;
}) {
  if (ref.startsWith("user.")) {
    const inputName = ref.slice("user.".length);
    if (declaredInputs.has(inputName)) return;
    throw new ZapRunError({
      code: "SCHEMA_INVALID",
      message: `Step ${stepId} references undeclared input ${ref}.`,
      remediation: `Declare input ${inputName} or remove ${ref} from the step refs.`,
      retryable: false,
    });
  }

  if (ref.endsWith(".*")) {
    const prefix = ref.slice(0, -2);
    if (priorSteps.has(prefix)) return;
    throw new ZapRunError({
      code: "SCHEMA_INVALID",
      message: `Step ${stepId} references unknown repeated step ${ref}.`,
      remediation: `Move the referenced step before ${stepId}, fix the step id, or remove ${ref}.`,
      retryable: false,
    });
  }

  if (priorSteps.has(ref) || declaredInputs.has(ref)) return;

  throw new ZapRunError({
    code: "SCHEMA_INVALID",
    message: `Step ${stepId} references unknown input or step ${ref}.`,
    remediation: `Use user.<input>, a prior step id, or a declared bare input name for ${ref}.`,
    retryable: false,
  });
}

function validateVideoDurations(spec: ZapSpec) {
  for (const step of spec.steps) {
    if (step.kind.startsWith("video.") && step.duration_s === undefined) {
      throw new ZapRunError({
        code: "SCHEMA_INVALID",
        message: `Video step ${step.id} is missing duration_s.`,
        remediation: "Add duration_s so the runner can quote cost and enforce budget before submission.",
        retryable: false,
      });
    }
  }
}

function validateTemplateVariables(
  spec: ZapSpec,
  stepId: string,
  template: string,
  declared = new Set(Object.keys(spec.inputs)),
) {
  for (const variable of template.matchAll(/\{([A-Z0-9_]+)\}/g)) {
    if (!declared.has(variable[1])) {
      throw new ZapRunError({
        code: "SCHEMA_INVALID",
        message: `Step ${stepId} references undeclared input {${variable[1]}}.`,
        remediation: `Declare input ${variable[1]} in the Zap frontmatter or remove the template variable.`,
        retryable: false,
      });
    }
  }
}

function isPromptFile(prompt: string) {
  return prompt.endsWith(".md") || prompt.startsWith("prompts/");
}

function titleize(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
