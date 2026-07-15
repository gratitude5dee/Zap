import { promises as fs } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { parseDocument } from "yaml";
import { convexServiceToken } from "./convex-service";
import { parseZapMarkdown, publicZapSpec, type PublicZapSpec, type ZapSpec } from "./zap-schema";
import { canonicalZapRegistryIndex } from "./zap-registry";

const skillsDir = path.join(process.cwd(), "agent", "skills");
const getZapBySlug = makeFunctionReference<"query">("zaps:getBySlug");
const getOwnedZapBySlug = makeFunctionReference<"query">("zaps:getOwnedBySlug");
const listZaps = makeFunctionReference<"query">("zaps:list");
const publishedPromptBundles = new Map<string, Record<string, string>>();

export async function loadZapFromSkill(slug: string, authorId?: string): Promise<PublicZapSpec | null> {
  const spec = await loadPublicZapSpec(slug, authorId);
  return spec ? publicZapSpec(spec) : null;
}

/**
 * Public web, embed, and generic run entry points must use this loader.
 * `loadZapSpec` deliberately remains available for durable internal run
 * recovery, including private service recipes such as Air.
 */
export async function loadPublicZapSpec(slug: string, authorId?: string): Promise<ZapSpec | null> {
  const spec = await loadZapSpec(slug, authorId);
  return spec && spec.publish?.visibility !== "private" ? spec : null;
}

export async function loadZapSpec(slug: string, authorId?: string): Promise<ZapSpec | null> {
  const published = await loadPublishedZapSpec(slug, authorId);
  if (published) return published;
  const file = path.join(skillsDir, `zap-${slug}`, "Zap.md");
  try {
    return parseZapSource(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listZapSpecs(): Promise<PublicZapSpec[]> {
  const published = await listPublishedZapSpecs();
  const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  const zaps = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("zap-"))
    .map((entry) => loadZapFromSkill(entry.name.slice("zap-".length))));
  return zaps
    .concat(published)
    .filter((zap): zap is PublicZapSpec => Boolean(zap))
    .filter((zap, index, all) => all.findIndex((candidate) => candidate.zap === zap.zap) === index)
    .sort((left, right) => left.title.localeCompare(right.title));
}

/** Public gallery membership and ordering come exclusively from the generated registry index. */
export async function listCanonicalZapSpecs(): Promise<PublicZapSpec[]> {
  const zaps = await Promise.all(canonicalZapRegistryIndex.zaps.map((entry) => loadLocalZapSpec(entry.slug)));
  return zaps.map((zap, index) => {
    if (!zap) {
      throw new Error(`Canonical Zap ${canonicalZapRegistryIndex.zaps[index]?.slug ?? index} is missing its local Zap.md source.`);
    }
    return publicZapSpec(zap);
  });
}

export async function readPrompt(slug: string, promptPath?: string) {
  if (!promptPath) return "";
  const publishedPrompt = publishedPromptBundles.get(slug)?.[promptPath];
  if (publishedPrompt !== undefined) return publishedPrompt;
  if (!promptPath.startsWith("prompts/") || !promptPath.endsWith(".md")) return promptPath;
  const normalizedPromptPath = path.posix.normalize(promptPath.replaceAll("\\", "/"));
  if (!normalizedPromptPath.startsWith("prompts/") || normalizedPromptPath.includes("../")) {
    throw new Error(`Invalid prompt file reference: ${promptPath}`);
  }
  const file = path.join(skillsDir, `zap-${slug}`, normalizedPromptPath);
  return fs.readFile(file, "utf8");
}

async function loadPublishedZapSpec(slug: string, authorId?: string) {
  const client = getConvexClient();
  if (!client) return null;
  try {
    const row = await (authorId
      ? client.query(getOwnedZapBySlug, { authorId, serviceToken: convexServiceToken(), slug })
      : client.query(getZapBySlug, { slug })) as { source?: string; status?: string } | null;
    if (!row || row.status !== "published" || !row.source) return null;
    return parsePublishedSource(slug, row.source);
  } catch {
    return null;
  }
}

async function listPublishedZapSpecs() {
  const client = getConvexClient();
  if (!client) return [];
  try {
    const rows = await client.query(listZaps, { status: "published" }) as Array<{ slug: string; source?: string }>;
    return rows.flatMap((row) => {
      if (!row.source) return [];
      const spec = parsePublishedSource(row.slug, row.source);
      return spec && spec.publish?.visibility !== "private" ? [publicZapSpec(spec)] : [];
    });
  } catch {
    return [];
  }
}

function parsePublishedSource(slug: string, source: string) {
  try {
    const parsed = JSON.parse(source) as { prompts?: Record<string, string>; zapMd?: string };
    if (!parsed.zapMd) return null;
    publishedPromptBundles.set(slug, parsed.prompts ?? {});
    return parseZapSource(parsed.zapMd);
  } catch {
    return parseZapSource(source);
  }
}

/**
 * Preserve explicit private visibility from source in addition to schema
 * normalization. This keeps public exposure fail-closed across package/schema
 * upgrades and is especially important for local service recipes.
 */
function parseZapSource(markdown: string): ZapSpec {
  const spec = parseZapMarkdown(markdown);
  return readPrivateVisibility(markdown) ? {
    ...spec,
    publish: { ...spec.publish, visibility: "private" },
  } : spec;
}

function readPrivateVisibility(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return false;
  const parsed = parseDocument(match[1]).toJS();
  if (typeof parsed !== "object" || parsed === null || !("publish" in parsed)) return false;
  const publish = (parsed as { publish?: unknown }).publish;
  return typeof publish === "object"
    && publish !== null
    && (publish as { visibility?: unknown }).visibility === "private";
}

function getConvexClient() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

async function loadLocalZapSpec(slug: string): Promise<ZapSpec | null> {
  try {
    return parseZapSource(await fs.readFile(path.join(skillsDir, `zap-${slug}`, "Zap.md"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
