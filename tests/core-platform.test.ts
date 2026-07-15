import { afterEach, describe, expect, it, vi } from "vitest";
import { planZapRun } from "../packages/core/src/planner";
import { parseZapMarkdown } from "../packages/core/src/schema";
import { listProviderAdapters } from "@wzrdtech/providers";

describe("platform core", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses HyperFrames stitch settings", () => {
    const zap = parseZapMarkdown(`---
zap: hyperframes-demo
version: 2
description: demo
inputs:
  initial_gen: { type: video, required: false }
budget:
  estimate_usd: 0
  cap_usd: 1
steps:
  - id: stitch
    kind: stitch
    inputs: [initial_gen]
    stitch:
      engine: hyperframes
      quality: high
      format: mp4
---
`);

    expect(zap.steps[0]?.stitch?.engine).toBe("hyperframes");
  });

  it("rejects duplicate step ids", () => {
    expect(() => parseZapMarkdown(`---
zap: duplicate-demo
version: 2
description: demo
budget:
  estimate_usd: 0
  cap_usd: 1
steps:
  - id: frame
    kind: image.gen
  - id: frame
    kind: video.gen
---
`)).toThrow(/Duplicate step id/);
  });

  it("plans repeated extension steps within max", () => {
    const zap = parseZapMarkdown(`---
zap: repeat-demo
version: 2
description: demo
budget:
  estimate_usd: 0
  cap_usd: 1
steps:
  - id: extend
    kind: video.extend
    duration_s: 5
    model: seedance-2-0-260128
    repeat:
      max: 2
  - id: stitch
    kind: stitch
---
`);

    const plan = planZapRun(zap, 5);
    expect(plan.steps.map((step) => step.id)).toEqual(["extend_1", "extend_2", "stitch"]);
  });

  it("requires an operator-configured price for Seedance Fast", () => {
    const zap = parseZapMarkdown(`---
zap: air-test
version: 2
description: test
budget:
  estimate_usd: 0
  cap_usd: 5
steps:
  - id: seedance
    kind: video.gen
    model: seedance-2-0-fast-260128
    duration_s: 5
---
`);

    vi.stubEnv("GMI_SEEDANCE_FAST_USD_PER_SECOND", "");
    expect(() => planZapRun(zap, 0)).toThrow(/GMI_SEEDANCE_FAST_USD_PER_SECOND/);

    vi.stubEnv("GMI_SEEDANCE_FAST_USD_PER_SECOND", "0.2");
    expect(planZapRun(zap, 0).estimateUsd).toBeCloseTo(1);
  });

  it("exports only live BYOK provider adapters", () => {
    expect(listProviderAdapters().map((adapter) => adapter.id).sort()).toEqual(["aws", "fal", "gmi", "prodia", "runware", "vertex"]);
  });
});
