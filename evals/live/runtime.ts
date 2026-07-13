export type LiveEvalEnv = Readonly<Record<string, string | undefined>>;

const defaultJudgeModel = "google/gemini-2.5-flash";

/** Paid eval work is disabled unless the operator opts in with the exact value `1`. */
export function isLiveEvalEnabled(env: LiveEvalEnv = process.env) {
  return env.EVALS_LIVE?.trim() === "1";
}

/** The eval judge is intentionally configurable independently of the agent under test. */
export function resolveLiveJudgeModel(env: LiveEvalEnv = process.env) {
  return firstNonEmpty(env.EVALS_JUDGE_MODEL, env.ZAP_JUDGE_MODEL, defaultJudgeModel);
}

/** Resolve a persisted output so the target's real `judge_asset` tool grades it in place. */
export function resolveLiveAssetFixture(env: LiveEvalEnv = process.env) {
  const fixture = {
    assetId: env.EVALS_LIVE_ASSET_ID?.trim(),
    runId: env.EVALS_LIVE_RUN_ID?.trim(),
    stepId: env.EVALS_LIVE_STEP_ID?.trim(),
  };
  const configured = Object.values(fixture).filter(Boolean).length;
  if (configured === 0) return undefined;
  if (configured !== 3) {
    throw new Error(
      "EVALS_LIVE_ASSET_ID, EVALS_LIVE_RUN_ID, and EVALS_LIVE_STEP_ID must be set together.",
    );
  }
  return fixture as { assetId: string; runId: string; stepId: string };
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return defaultJudgeModel;
}
