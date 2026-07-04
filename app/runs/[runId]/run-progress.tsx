"use client";

import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";

const getRun = makeFunctionReference<"query">("runs:get");

type RunView = {
  assets: Array<{ kind: string; stepId: string; url: string }>;
  run: {
    costUsd: number;
    error?: string;
    runId: string;
    stage?: string;
    status: string;
    zapUrl?: string;
  } | null;
  steps: Array<{
    actualUsd?: number;
    error?: string;
    kind: string;
    model?: string;
    progress: number;
    provider?: string;
    status: string;
    stepId: string;
  }>;
};

export function RunProgress({ runId, fallbackStatus }: { readonly fallbackStatus?: string; readonly runId: string }) {
  const data = useQuery(getRun, { runId }) as RunView | undefined;
  if (data === undefined) {
    return <p className="mt-4 text-sm text-white/50">Loading run state from Convex...</p>;
  }
  if (!data?.run) {
    return <p className="mt-4 text-sm text-white/50">Run queued locally: {fallbackStatus ?? "unknown"}</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-md border border-[#00e5ff]/30 bg-[#00e5ff]/10 px-2 py-1 text-[#00e5ff]">{data.run.status}</span>
        <span className="text-white/55">Stage: {data.run.stage ?? "pending"}</span>
        <span className="text-white/55">Cost: ${data.run.costUsd.toFixed(2)}</span>
      </div>
      {data.run.error ? <p className="rounded-md border border-red-400/25 bg-red-400/10 px-3 py-2 text-red-100 text-sm">{data.run.error}</p> : null}
      <div className="space-y-3">
        {data.steps.map((step) => (
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-3" key={step.stepId}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-white">{step.stepId}</span>
              <span className="text-white/50">{step.status}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-md bg-white/10">
              <div className="h-full bg-[#00e5ff] transition-all" style={{ width: `${Math.round((step.progress ?? 0) * 100)}%` }} />
            </div>
            <p className="mt-2 text-white/45 text-xs">
              {step.provider ?? "local"} / {step.model ?? step.kind}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
