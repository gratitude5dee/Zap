import { RunProgress } from "./run-progress";
import { PageShell, SiteNav } from "@/app/_components/zap-chrome";

export default async function RunPage({ params }: { readonly params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return (
    <PageShell className="zap-paper-grid">
      <div className="mx-auto max-w-5xl px-5 py-5 lg:px-8">
        <SiteNav />
        <section className="mt-10 rounded-md border border-zap-line bg-white p-5">
          <p className="font-mono text-xs text-zap-muted">run status</p>
          <h1 className="mt-2 break-all font-semibold text-3xl leading-tight">Run {runId}</h1>
          <RunProgress runId={runId} />
        </section>
      </div>
    </PageShell>
  );
}
