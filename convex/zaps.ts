import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { status: v.optional(v.union(v.literal("draft"), v.literal("published"))) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const sortNewest = (rows: any[]) => rows.sort((left, right) =>
      (right.finalizedAt ?? right.updatedAt ?? right.createdAt ?? 0) - (left.finalizedAt ?? left.updatedAt ?? left.createdAt ?? 0),
    );
    if (args.status) {
      return sortNewest(await ctx.db.query("zaps").withIndex("by_status", (q: any) => q.eq("status", args.status)).collect());
    }
    return sortNewest(await ctx.db.query("zaps").collect());
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
  },
});

export const upsert = mutation({
  args: {
    authorId: v.optional(v.string()),
    compiledFromRunId: v.optional(v.string()),
    description: v.optional(v.string()),
    estimateUsd: v.number(),
    finalizedAt: v.optional(v.number()),
    finalizedBy: v.optional(v.string()),
    heroAssetUrl: v.optional(v.string()),
    slug: v.string(),
    source: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    tags: v.array(v.string()),
    title: v.optional(v.string()),
    version: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("zaps", { ...args, createdAt: now, updatedAt: now });
  },
});

export const finalize = mutation({
  args: {
    authorId: v.optional(v.string()),
    compiledFromRunId: v.optional(v.string()),
    description: v.optional(v.string()),
    finalizedBy: v.optional(v.string()),
    heroAssetUrl: v.optional(v.string()),
    slug: v.string(),
    tags: v.optional(v.array(v.string())),
    title: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
    if (!existing) throw new Error(`Zap ${args.slug} does not exist.`);
    await ctx.db.patch(existing._id, {
      authorId: args.authorId ?? existing.authorId,
      compiledFromRunId: args.compiledFromRunId ?? existing.compiledFromRunId,
      description: args.description ?? existing.description,
      finalizedAt: Date.now(),
      finalizedBy: args.finalizedBy ?? args.authorId ?? existing.finalizedBy,
      heroAssetUrl: args.heroAssetUrl ?? existing.heroAssetUrl,
      status: "published",
      tags: args.tags ?? existing.tags,
      title: args.title ?? existing.title,
      updatedAt: Date.now(),
    });
    return existing._id;
  },
});
