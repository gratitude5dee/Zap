import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { parseZapMarkdown } from "@/lib/zap-schema";
import { publicZapOrigin } from "@/lib/zap-urls";

const upsertZap = makeFunctionReference<"mutation">("zaps:upsert");
const finalizeZap = makeFunctionReference<"mutation">("zaps:finalize");

const publishSchema = z.object({
  authorId: z.string().optional(),
  compiledFromRunId: z.string().optional(),
  description: z.string().optional(),
  finalize: z.boolean().default(false),
  finalizedBy: z.string().optional(),
  heroAssetUrl: z.string().url().optional(),
  prompts: z.record(z.string(), z.string()).default({}),
  slug: z.string().optional(),
  source: z.unknown().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  tags: z.array(z.string()).default([]),
  title: z.string().optional(),
  zapMd: z.string().optional(),
});

export async function POST(request: Request) {
  const configuredToken = process.env.ZAP_PUBLISH_TOKEN;
  const providedToken = bearerToken(request);
  if (!configuredToken && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "ZAP_PUBLISH_TOKEN is required before publishing zaps." }, { status: 503 });
  }
  if (configuredToken && providedToken !== configuredToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = publishSchema.parse(await request.json());
  const zapMd = input.zapMd ?? sourceZapMd(input.source);
  if (!zapMd) return NextResponse.json({ error: "zapMd is required." }, { status: 400 });

  const spec = parseZapMarkdown(zapMd);
  const slug = input.slug ?? spec.publish?.slug ?? spec.zap;
  if (isReservedSlug(slug)) return NextResponse.json({ error: `${slug} is reserved.` }, { status: 400 });

  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required." }, { status: 503 });

  const client = new ConvexHttpClient(convexUrl);
  const source = JSON.stringify({ prompts: input.prompts, zapMd });
  const status = input.finalize ? "published" : input.status;
  const id = await client.mutation(upsertZap, {
    authorId: input.authorId,
    compiledFromRunId: input.compiledFromRunId,
    description: input.description ?? spec.description,
    estimateUsd: spec.budget.estimate_usd,
    heroAssetUrl: input.heroAssetUrl,
    slug,
    source,
    status,
    tags: input.tags,
    title: input.title,
    version: spec.version,
  });
  if (input.finalize) {
    await client.mutation(finalizeZap, {
      authorId: input.authorId,
      compiledFromRunId: input.compiledFromRunId,
      description: input.description ?? spec.description,
      finalizedBy: input.finalizedBy ?? input.authorId,
      heroAssetUrl: input.heroAssetUrl,
      slug,
      tags: input.tags,
      title: input.title,
    });
  }

  return NextResponse.json({
    canonicalUrl: publicUrl(`/${slug}`),
    embedUrl: publicUrl(`/embed/${slug}`),
    id,
    slug,
    status,
    version: spec.version,
  });
}

function sourceZapMd(source: unknown) {
  if (typeof source === "string") return source;
  if (typeof source === "object" && source && "zapMd" in source) {
    const value = (source as { zapMd?: unknown }).zapMd;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return "";
  return header.slice("bearer ".length).trim();
}

function publicUrl(pathname: string) {
  return `${publicZapOrigin()}${pathname}`;
}
