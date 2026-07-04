import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    assetId: v.optional(v.string()),
    comment: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    kind: v.union(v.literal("rlhf_vote"), v.literal("judge_score")),
    rater: v.union(v.literal("heuristic"), v.literal("human"), v.literal("vlm")),
    runId: v.string(),
    scores: v.any(),
    stepId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await ctx.db.insert("feedback", {
      ...args,
      createdAt: args.createdAt ?? Date.now(),
    });
  },
});

export const listByRun = query({
  args: { runId: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("feedback")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .collect();
  },
});
