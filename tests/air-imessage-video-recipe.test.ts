import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { planZapRun } from "../packages/core/src/planner.ts";
import { parseZapMarkdown, validateZapPromptTemplates } from "../packages/core/src/schema.ts";

const recipeDirectory = path.join(process.cwd(), "agent", "skills", "zap-air-imessage-video");

describe("Air iMessage video recipe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is private, accepts an optional first frame, and plans from an operator rate", async () => {
    const [markdown, prompt] = await Promise.all([
      readFile(path.join(recipeDirectory, "Zap.md"), "utf8"),
      readFile(path.join(recipeDirectory, "prompts", "generate.md"), "utf8"),
    ]);
    const spec = parseZapMarkdown(markdown);
    validateZapPromptTemplates(spec, { "prompts/generate.md": prompt });

    expect(spec.publish?.visibility).toBe("private");
    expect(spec.inputs).toMatchObject({
      IMAGE: { required: false, type: "image" },
      PROMPT: { required: true, type: "textarea" },
    });
    expect(spec.steps).toMatchObject([
      {
        duration_s: 5,
        id: "seedance",
        kind: "video.gen",
        model: "seedance-2-0-fast-260128",
        provider: "gmi",
      },
      { id: "finalize", kind: "stitch" },
    ]);

    vi.stubEnv("GMI_SEEDANCE_FAST_USD_PER_SECOND", "0.2");
    expect(planZapRun(spec, 0)).toMatchObject({ estimateUsd: 1, zap: "air-imessage-video" });
  });
});
