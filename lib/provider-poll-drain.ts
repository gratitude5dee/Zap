import { cleanupExpiredAirVideoAssets } from "@/lib/air-video-service";
import { recordProviderProgress } from "@/lib/provider-webhooks";
import {
  acknowledgeProviderPoll,
  acquireProviderPollDrainLease,
  deadLetterProviderPoll,
  deferProviderPoll,
  dequeueProviderPoll,
  isProviderPollDeadlineExceeded,
  recoverProviderPolls,
  releaseProviderPollDrainLease,
  requeueProviderPoll,
  type LeasedProviderPollJob,
} from "@/lib/redis";
import { pollGeneration } from "@/lib/providers/router";
import { getRunSnapshot } from "@/lib/run-ledger";
import { revealZapSecretsForProviderByUserId } from "@/lib/supabase/server";
import { listProviderAdapters } from "@wzrdtech/providers";

const providers = listProviderAdapters().map((adapter) => adapter.id);
const maxPollsPerProvider = 10;
const maxQueueScansPerProvider = maxPollsPerProvider * 3;

export interface ProviderPollDrainResult {
  readonly cleanedAssets: number;
  readonly drained: number;
  readonly results: ReadonlyArray<{
    readonly provider: string;
    readonly requestId: string;
    readonly status: string;
  }>;
}

/**
 * One bounded, idempotent pass over the durable provider poll queue. Both the
 * legacy Convex trigger and Vercel Cron call this function so their scheduling
 * differences cannot change queue semantics.
 */
export async function drainProviderPollQueue(): Promise<ProviderPollDrainResult> {
  const lease = await acquireProviderPollDrainLease();
  // A concurrent Vercel/Convex invocation owns the current pass. Returning a
  // normal empty result is intentional: Vercel does not retry cron failures,
  // and the lock holder will reconcile the durable queue.
  if (!lease) return { cleanedAssets: 0, drained: 0, results: [] };

  try {
    return await drainProviderPollQueueUnderLease();
  } finally {
    await releaseProviderPollDrainLease(lease).catch(() => false);
  }
}

async function drainProviderPollQueueUnderLease(): Promise<ProviderPollDrainResult> {
  const results: Array<{ provider: string; requestId: string; status: string }> = [];

  for (const provider of providers) {
    // Every dequeue is first moved to a visibility lease. Reclaim leases from
    // interrupted invocations before accepting fresh work, so a Vercel crash
    // cannot silently lose an in-flight GMI request.
    await recoverProviderPolls(provider).catch(() => 0);
    const seenRequestIds = new Set<string>();
    const deferredJobs: LeasedProviderPollJob[] = [];
    let polled = 0;
    let scanned = 0;
    while (polled < maxPollsPerProvider && scanned < maxQueueScansPerProvider) {
      const job = await dequeueProviderPoll(provider);
      if (!job) break;
      scanned += 1;

      if (seenRequestIds.has(job.requestId)) {
        // Hold the leased duplicate until this drain has reached every other
        // ready job. This prevents an immediate retry loop while leaving the
        // receipt recoverable if the worker stops before it is deferred.
        deferredJobs.push(job);
        continue;
      }
      seenRequestIds.add(job.requestId);
      polled += 1;

      try {
        if (isProviderPollDeadlineExceeded(job)) {
          await failExpiredProviderPoll(job);
          results.push({ provider, requestId: job.requestId, status: "failed" });
          continue;
        }

        const runId = job.runId;
        const stepId = job.stepId;
        const owner = runId ? (await getRunSnapshot(runId)).run?.userId : undefined;
        const secrets = await revealZapSecretsForProviderByUserId(provider, owner);
        const result = await pollGeneration(provider, job.requestId, secrets);
        // Keep the 60-minute bound hard even when the provider finally answers
        // after the deadline. Air must surface a deterministic terminal state,
        // not continue extending work based on a retry count.
        if (isProviderPollDeadlineExceeded(job)) {
          await failExpiredProviderPoll(job);
          results.push({ provider, requestId: job.requestId, status: "failed" });
          continue;
        }
        const recorded = await recordProviderProgress(provider, result, {
          capability: job.capability,
          requestId: job.requestId,
          runId,
          stepId,
        });
        // A terminal provider response is not safe to drop until its durable
        // ledger update succeeds. In particular, a cold Convex failure must
        // leave the job available for the next protected poll invocation.
        if (!recorded.observed) {
          throw new Error(`Provider progress was not persisted (${recorded.reason}).`);
        }

        if (result.status === "queued" || result.status === "running") {
          await requeueProviderPoll(job);
        } else {
          await acknowledgeProviderPoll(job);
        }

        results.push({ provider, requestId: job.requestId, status: result.status });
      } catch {
        if (isProviderPollDeadlineExceeded(job)) {
          // If Convex was temporarily unavailable while terminalizing, put the
          // lease back immediately; its unchanged deadline guarantees the next
          // worker still terminalizes rather than polling past one hour.
          await failExpiredProviderPoll(job).catch(() => requeueProviderPoll(job));
        } else {
          await requeueProviderPoll(job);
        }
        results.push({ provider, requestId: job.requestId, status: "retry" });
      }
    }
    // A non-terminal response is requeued for the next cron. Return duplicate
    // receipts only after the scan so RPOP can reach distinct queued jobs
    // without polling the same provider request twice in this invocation.
    for (const job of deferredJobs) {
      await deferProviderPoll(job);
    }
  }

  const cleanedAssets = await cleanupExpiredAirVideoAssets().catch(() => 0);
  return { cleanedAssets, drained: results.length, results };
}

async function failExpiredProviderPoll(job: LeasedProviderPollJob) {
  const recorded = await recordProviderProgress(job.provider, {
    error: "POLL_DEADLINE_EXCEEDED",
    progress: 1,
    status: "failed",
  }, {
    capability: job.capability,
    requestId: job.requestId,
    runId: job.runId,
    stepId: job.stepId,
  });
  if (!recorded.observed) {
    throw new Error(`Provider deadline failure was not persisted (${recorded.reason}).`);
  }
  await deadLetterProviderPoll(job, "Poll deadline exceeded.");
}
