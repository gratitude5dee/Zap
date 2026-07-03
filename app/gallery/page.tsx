import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeDollarSign, Film, Sparkles, Workflow } from "lucide-react";
import { Eyebrow, PageShell, SiteNav } from "@/app/_components/zap-chrome";
import { listZapSpecs } from "@/lib/zap-files";

export default async function GalleryPage() {
  const zaps = await listZapSpecs();

  return (
    <PageShell className="zap-paper-grid">
      <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">
        <SiteNav />

        <header className="mt-12 border-zap-line border-b pb-10">
          <Eyebrow tone="blue">
            <Sparkles className="size-4" />
            Local Zap registry
          </Eyebrow>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <h1 className="text-balance font-semibold text-5xl leading-none sm:text-6xl">Zap Gallery</h1>
              <p className="mt-5 max-w-3xl text-pretty leading-7 text-zap-muted">
                Pick a recipe, inspect the step graph, run a mock pipeline, then switch to live providers only when keys and budgets are ready.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <RegistryMetric label="recipes" value={String(zaps.length)} />
              <RegistryMetric label="default" value="mock" />
              <RegistryMetric label="spend" value="$0" />
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {zaps.map((zap) => (
            <Link className="group rounded-md border border-zap-line bg-white p-5 transition hover:-translate-y-0.5 hover:border-zap-blue/60" href={`/zap/${zap.zap}`} key={zap.zap}>
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="font-mono text-xs text-zap-muted">{zap.zap}</p>
                  <h2 className="mt-2 font-semibold text-2xl leading-tight">{zap.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-zap-muted">{zap.description}</p>
                </div>
                <Film className="size-6 shrink-0 text-zap-blue transition group-hover:scale-110" />
              </div>
              <div className="mt-6 grid gap-2 sm:grid-cols-3">
                <RecipeMeta icon={<Workflow className="size-4" />} label="Steps" value={String(zap.steps.length)} />
                <RecipeMeta icon={<BadgeDollarSign className="size-4" />} label="Cap" value={`$${zap.budget.cap_usd}`} />
                <RecipeMeta icon={<Film className="size-4" />} label="Output" value={zap.output} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

function RegistryMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-zap-line bg-white p-3">
      <p className="font-semibold text-2xl leading-none">{value}</p>
      <p className="mt-2 text-xs text-zap-muted">{label}</p>
    </div>
  );
}

function RecipeMeta({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-zap-fog px-3 py-3">
      <div className="flex items-center gap-2 text-zap-muted">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 truncate font-medium text-sm">{value}</p>
    </div>
  );
}
