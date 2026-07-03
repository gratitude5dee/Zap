import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  Braces,
  CheckCircle2,
  Clock3,
  Film,
  KeyRound,
  Play,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import { CodeWindow, Eyebrow, PageShell, SiteNav, TextLink } from "@/app/_components/zap-chrome";
import { listZapSpecs } from "@/lib/zap-files";

const cliProof = `npx @zap-md/cli init match-day
cd match-day
zap new world-cup-entrance
zap validate
zap run agent/skills/zap-world-cup-entrance/Zap.md --json

{
  "mode": "mock",
  "status": "done",
  "spendUsd": 0,
  "zapUrl": "mock://zap/world-cup-entrance/Zap.mp4"
}`;

export default async function Page() {
  const zaps = await listZapSpecs();
  const featured = zaps.slice(0, 3);

  return (
    <PageShell tone="dark">
      <section className="zap-metal-field overflow-hidden border-white/10 border-b">
        <div className="mx-auto grid min-h-[86svh] max-w-7xl content-between px-5 py-5 lg:px-8">
          <SiteNav tone="dark" />

          <div className="grid items-center gap-9 py-8 lg:grid-cols-[minmax(0,1fr)_520px] lg:py-10">
            <div className="relative z-10 max-w-3xl">
              <Eyebrow>
                <Sparkles className="size-4" />
                Portable Eve skills for creator-grade media runs
              </Eyebrow>
              <h1 className="mt-6 text-balance font-semibold text-6xl leading-none text-white sm:text-7xl lg:text-8xl">
                Zap
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-white/70">
                A lightweight agent platform for packaging one-shot image, video, audio, and stitch workflows as inspectable recipes that run from the CLI or a creator studio.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-white px-5 font-medium text-zap-ink transition hover:bg-zap-ash" href="/zap/world-cup-entrance">
                  <Play className="size-4" />
                  Run demo Zap
                </Link>
                <Link className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/15 px-5 font-medium text-white transition hover:bg-white/10" href="/quickstart">
                  <TerminalSquare className="size-4" />
                  Agent quickstart
                </Link>
              </div>
            </div>

            <div className="relative min-h-[520px] lg:min-h-[620px]">
              <Image
                alt="Metallic blue Zap lightning mark"
                className="absolute inset-x-0 top-0 mx-auto h-[420px] w-[280px] object-cover object-center opacity-95 drop-shadow-[0_0_44px_rgba(34,135,255,0.35)] sm:h-[520px] sm:w-[350px] lg:h-[620px] lg:w-[420px]"
                height={1536}
                priority
                sizes="(max-width: 1024px) 70vw, 420px"
                src="/zaplogo.png"
                width={1024}
              />
              <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[520px]">
                <CodeWindow label="terminal" status="mock safe">
                  {cliProof}
                </CodeWindow>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-white/10 border-t pt-5 sm:grid-cols-3">
            <Signal icon={<BadgeDollarSign className="size-4" />} label="Zero-spend demos" value="Mock runs are the default until the creator explicitly chooses live providers." />
            <Signal icon={<Workflow className="size-4" />} label="Durable run state" value="Convex records runs while Upstash handles idempotency, queues, and polling." />
            <Signal icon={<KeyRound className="size-4" />} label="BYOK vault" value="Provider keys stay user-owned in Supabase, masked in the browser." />
          </div>
        </div>
      </section>

      <section className="bg-zap-paper text-zap-ink">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
            <div>
              <Eyebrow tone="neutral">
                <Braces className="size-4" />
                Zap.md runtime contract
              </Eyebrow>
              <h2 className="mt-4 text-balance font-semibold text-4xl leading-tight">
                Recipes agents can read, creators can run, and operators can audit.
              </h2>
              <p className="mt-4 text-pretty leading-7 text-zap-muted">
                Zap keeps the recipe, prompts, budget, provider routing, and output shape in files first. The studio is a runner, not a black box.
              </p>
              <TextLink href="/docs">Read the schema docs</TextLink>
            </div>

            <div className="grid gap-3">
              <RuntimeRow icon={<Boxes className="size-5" />} title="Skill package" body="Every Zap ships as `SKILL.md`, `Zap.md`, prompt files, and registry metadata." detail={`${zaps.length} local recipes`} />
              <RuntimeRow icon={<ShieldCheck className="size-5" />} title="Budget guard" body="CLI and server paths estimate spend, enforce caps, and require explicit live approval." detail="mock by default" />
              <RuntimeRow icon={<Clock3 className="size-5" />} title="Polling flow" body="Provider submissions enqueue durable poll jobs and update Convex idempotently." detail="retry + dead letter" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-zap-line border-y bg-white text-zap-ink">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-medium text-sm text-zap-blue">Installed recipes</p>
              <h2 className="mt-2 font-semibold text-4xl leading-tight">Creator flows ready to run</h2>
            </div>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zap-line px-4 font-medium text-sm transition hover:bg-zap-fog" href="/gallery">
              View gallery
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featured.map((zap) => (
              <Link className="group rounded-md border border-zap-line bg-zap-paper p-5 transition hover:-translate-y-0.5 hover:border-zap-blue/55 hover:bg-white" href={`/zap/${zap.zap}`} key={zap.zap}>
                <div className="flex min-h-11 items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-xl">{zap.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zap-muted">{zap.description}</p>
                  </div>
                  <Film className="size-5 shrink-0 text-zap-blue" />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
                  <RecipeStat value={`${zap.steps.length}`} label="steps" />
                  <RecipeStat value={`$${zap.budget.estimate_usd.toFixed(2)}`} label="est." />
                  <RecipeStat value={zap.defaults.provider} label="default" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-zap-ink text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[1fr_420px] lg:px-8">
          <div>
            <Eyebrow tone="amber">
              <CheckCircle2 className="size-4" />
              Agent-compatible by design
            </Eyebrow>
            <h2 className="mt-4 text-balance font-semibold text-4xl leading-tight">Point Codex, Claude Code, Cursor, OpenClaw, or Hermes at the URL.</h2>
              <p className="mt-4 max-w-2xl leading-7 text-white/70">
              The framework exposes download URLs for skills, JSON manifests, docs topics, and mock run commands so agents can start with evidence instead of guessing.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 p-5">
            <p className="font-mono text-xs text-white/50">agent bootstrap</p>
            <div className="mt-4 grid gap-3 text-sm">
              <Endpoint label="Manifest" value="https://zap.wzrd.tech/api/skills" />
              <Endpoint label="Core skill" value="https://zap.wzrd.tech/api/skills/zap" />
              <Endpoint label="Authoring" value="https://zap.wzrd.tech/api/skills/zap-authoring" />
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function Signal({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.055] p-4">
      <div className="flex items-center gap-2 text-zap-cyan">
        {icon}
        <p className="font-medium text-sm text-white">{label}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-white/60">{value}</p>
    </div>
  );
}

function RuntimeRow({ body, detail, icon, title }: { readonly body: string; readonly detail: string; readonly icon: ReactNode; readonly title: string }) {
  return (
    <div className="grid gap-4 rounded-md border border-zap-line bg-white p-4 sm:grid-cols-[44px_1fr_150px] sm:items-center">
      <div className="flex size-11 items-center justify-center rounded-md bg-zap-ink text-zap-cyan">{icon}</div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-zap-muted">{body}</p>
      </div>
      <p className="rounded-md bg-zap-fog px-3 py-2 font-mono text-xs text-zap-muted">{detail}</p>
    </div>
  );
}

function RecipeStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="min-w-0 rounded-md bg-white px-2 py-2">
      <span className="block truncate font-medium">{value}</span>
      <span className="mt-1 block text-zap-muted">{label}</span>
    </span>
  );
}

function Endpoint({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-zap-ink px-3 py-3">
      <span className="font-medium text-white/70">{label}</span>
      <span className="break-all font-mono text-zap-cyan text-xs">{value}</span>
    </div>
  );
}
