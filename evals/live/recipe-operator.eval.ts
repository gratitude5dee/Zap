import { promises as fs } from "node:fs";
import path from "node:path";
import { defineEval } from "eve/evals";
import { parseZapMarkdown } from "@wzrdtech/core/schema";
import { canonicalZapRegistryIndex } from "../../lib/zap-registry";
import { isLiveEvalEnabled, resolveLiveJudgeModel } from "./runtime";

const cases = await Promise.all(canonicalZapRegistryIndex.zaps.map(async (entry) => {
  const source = await fs.readFile(
    path.join(process.cwd(), "registry", "zaps", `zap-${entry.slug}`, "Zap.md"),
    "utf8",
  );
  return { entry, spec: parseZapMarkdown(source) };
}));

export default cases.map(({ entry, spec }) => defineEval({
  description: `Live-model operator and judge regression for the ${entry.slug} dry-run target.`,
  judge: { model: resolveLiveJudgeModel() },
  metadata: { recipe: entry.slug, spend: "llm-only" },
  tags: ["live", "judge", "recipe"],
  timeoutMs: 120_000,
  async test(t) {
    if (!isLiveEvalEnabled()) {
      t.skip("Live model and judge calls require EVALS_LIVE=1.");
      return;
    }

    const inputs = Object.fromEntries(
      Object.keys(spec.inputs).map((name) => [
        name,
        name === "image" ? "mock://eval-fixture.png" : `eval-${name.toLowerCase()}`,
      ]),
    );
    const turn = await t.send([
      "This is an operator regression eval.",
      `Call run_zap exactly once for recipe ${entry.slug}.`,
      "It must be a dry run with live=false and extendCount=0; do not submit provider work.",
      `Use these inputs exactly: ${JSON.stringify(inputs)}.`,
      "Then give a concise result containing the run id, quote, and confirmation that no provider work was submitted.",
    ].join("\n"));

    t.succeeded();
    t.noFailedActions();
    t.calledTool("run_zap", {
      count: 1,
      input: { dryRun: true, extendCount: 0, live: false, slug: entry.slug },
    });
    t.judge.autoevals.closedQA(
      "The response accurately and concisely identifies the recipe, run id, quoted cost, and that this was a dry run with no provider work submitted.",
      { on: turn.message },
    ).atLeast(0.7);
  },
}));
