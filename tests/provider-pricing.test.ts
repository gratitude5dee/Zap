import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listModelRates,
  modelRateFor,
  operatorPricedModels,
  priceGeneration,
  SEEDANCE_FAST_MODEL,
} from "../packages/providers/src/pricing.ts";

describe("operator-configured provider pricing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed and stays out of the capability manifest until Seedance Fast has a verified operator rate", () => {
    vi.stubEnv("GMI_SEEDANCE_FAST_USD_PER_SECOND", "not-a-rate");

    expect(operatorPricedModels[SEEDANCE_FAST_MODEL]).toEqual({ environmentVariable: "GMI_SEEDANCE_FAST_USD_PER_SECOND" });
    expect(modelRateFor(SEEDANCE_FAST_MODEL)).toBeUndefined();
    expect(listModelRates().some((rate) => rate.model === SEEDANCE_FAST_MODEL)).toBe(false);
    expect(() => priceGeneration(seedanceFastRequest())).toThrow(/No pricing is configured/);
  });

  it("uses the operator-configured Seedance Fast rate for quotes and discovery", () => {
    vi.stubEnv("GMI_SEEDANCE_FAST_USD_PER_SECOND", "0.2");

    expect(modelRateFor(SEEDANCE_FAST_MODEL)).toEqual({ perSecond: 0.2 });
    expect(listModelRates()).toContainEqual({ model: SEEDANCE_FAST_MODEL, perSecond: 0.2 });
    expect(priceGeneration(seedanceFastRequest())).toBeCloseTo(1);
  });
});

function seedanceFastRequest() {
  return {
    capability: "video.gen" as const,
    durationS: 5,
    inputs: {},
    model: SEEDANCE_FAST_MODEL,
    prompt: "test",
    provider: "gmi" as const,
    runId: "run_test",
    stepId: "seedance",
  };
}
