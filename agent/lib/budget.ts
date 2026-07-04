import { defineState } from "eve/context";

export const zapBudget = defineState("zap.budget", () => ({
  capUsd: 25,
  currentRunId: null as string | null,
  runs: {} as Record<string, { actualUsd?: number; quoteUsd: number; status: string }>,
  spentUsd: 0,
}));
