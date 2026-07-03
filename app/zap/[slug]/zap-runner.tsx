"use client";

import { CheckCircle2, CircleDollarSign, Film, ImageIcon, Play, Upload, WandSparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { RunProgress } from "@/app/runs/[runId]/run-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PublicZapSpec } from "@/lib/zap-schema";

type RunResponse = {
  message?: string;
  runId: string;
  status: string;
  zapUrl?: string;
};

export function ZapRunner({ zap }: { readonly zap: PublicZapSpec }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [extendCount, setExtendCount] = useState(0);
  const [live, setLive] = useState(false);
  const [run, setRun] = useState<RunResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textInputs = useMemo(
    () => Object.entries(zap.inputs).filter(([, input]) => input.type !== "image"),
    [zap.inputs],
  );
  const hasImage = Object.values(zap.inputs).some((input) => input.type === "image");
  const isMockOutput = run?.zapUrl?.startsWith("mock://");

  async function handleSubmit() {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/zaps/run", {
        body: JSON.stringify({
          extendCount,
          inputs: { ...values, image: imageDataUrl || undefined },
          live,
          slug: zap.zap,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as RunResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Zap run failed");
      }
      setRun(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Zap run failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="min-h-dvh bg-zap-paper text-zap-ink">
      <div className="mx-auto grid min-h-dvh w-full max-w-7xl grid-cols-1 lg:grid-cols-[390px_1fr]">
        <aside className="border-zap-line border-r bg-white px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <Link className="flex min-h-11 items-center gap-3" href="/">
              <span className="flex size-10 overflow-hidden rounded-md border border-white/20 bg-zap-ink">
                <Image alt="Zap" className="h-full w-full object-cover" height={64} src="/zaplogo.png" width={64} />
              </span>
              <span>
                <span className="block font-semibold text-lg leading-tight">Zap</span>
                <span className="text-zap-muted text-xs">creator recipe runner</span>
              </span>
            </Link>
            <WandSparkles className="size-5 text-zap-blue" />
          </div>

          <nav className="mt-5 flex gap-2 text-sm">
            <Link className="inline-flex min-h-10 items-center rounded-md px-3 text-zap-muted transition hover:bg-zap-fog hover:text-zap-ink" href="/gallery">Gallery</Link>
            <Link className="inline-flex min-h-10 items-center rounded-md px-3 text-zap-muted transition hover:bg-zap-fog hover:text-zap-ink" href="/docs">Docs</Link>
          </nav>

          <section className="mt-7 space-y-2">
            <div>
              <p className="font-mono text-xs text-zap-muted">{zap.zap}</p>
              <h1 className="mt-2 font-semibold text-3xl leading-tight">{zap.title}</h1>
              <p className="mt-2 text-sm text-zap-muted leading-6">{zap.description}</p>
            </div>
          </section>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <Metric icon={<CircleDollarSign className="size-4" />} label="Estimate" value={`$${zap.budget.estimate_usd.toFixed(2)}`} />
            <Metric icon={<Film className="size-4" />} label="Steps" value={String(zap.steps.length)} />
            <Metric icon={<CheckCircle2 className="size-4" />} label="Cap" value={`$${zap.budget.cap_usd}`} />
          </div>

          <div className="mt-7 space-y-4">
            {hasImage ? (
              <label className="block">
                <span className="mb-2 block font-medium text-sm">Selfie / reference image</span>
                <div className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-zap-line bg-zap-fog px-4 py-5 text-center transition hover:bg-zap-ash", imageDataUrl && "border-zap-blue bg-blue-50")}>
                  <Upload className="mb-2 size-5 text-zap-muted" />
                  <span className="text-sm text-zap-muted">{imageDataUrl ? "Image attached" : "Upload a clear front-facing image"}</span>
                  <input
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setImageDataUrl(String(reader.result));
                      reader.readAsDataURL(file);
                    }}
                    type="file"
                  />
                </div>
              </label>
            ) : null}

            {textInputs.map(([name, input]) => (
              <label className="block" key={name}>
                <span className="mb-2 block font-medium text-sm">{input.label ?? name}</span>
                {input.type === "textarea" ? (
                  <Textarea value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={input.hint} />
                ) : (
                  <Input value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} placeholder={input.hint} />
                )}
              </label>
            ))}

            <label className="block">
              <span className="mb-2 block font-medium text-sm">Extend segments</span>
              <Input max={64} min={0} onChange={(event) => setExtendCount(Number(event.target.value))} type="number" value={extendCount} />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-md border bg-zinc-50 px-3 py-2">
              <span>
                <span className="block font-medium text-sm">Live providers</span>
                <span className="text-zap-muted text-xs">{live ? "Provider keys and budgets required" : "Mock outputs, zero spend"}</span>
              </span>
              <input
                checked={live}
                className="size-4 accent-zap-blue"
                onChange={(event) => setLive(event.target.checked)}
                type="checkbox"
              />
            </label>

            <Button className="h-11 w-full gap-2" disabled={isRunning} onClick={handleSubmit}>
              <Play className="size-4" />
              {isRunning ? "Running Zap..." : live ? "Run Live Zap" : "Run Mock Zap"}
            </Button>
            {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">{error}</p> : null}
          </div>
        </aside>

        <section className="min-w-0 px-5 py-5 lg:px-8">
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="min-h-[420px] rounded-md border border-white/10 bg-zap-ink p-4 text-white shadow-[0_24px_70px_rgba(2,8,23,0.2)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-xl">Output</h2>
                  <p className="text-sm text-white/55">Final video and live run state land here.</p>
                </div>
                <ImageIcon className="size-5 text-white/50" />
              </div>
              {run?.zapUrl && !isMockOutput ? (
                <video className="mt-5 aspect-video w-full rounded-md bg-black" controls src={run.zapUrl} />
              ) : isMockOutput ? (
                <div className="mt-5 flex aspect-video flex-col items-center justify-center rounded-md border border-emerald-300/20 bg-emerald-400/10 px-5 text-center">
                  <CheckCircle2 className="mb-3 size-8 text-emerald-300" />
                  <p className="font-medium text-white">Mock Zap completed</p>
                  <p className="mt-2 max-w-md text-sm text-emerald-100/80">The pipeline, budget guard, and run state completed without provider spend.</p>
                </div>
              ) : (
                <div className="mt-5 flex aspect-video items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50">
                  Waiting for Zap.mp4
                </div>
              )}
            </div>

            <div className="rounded-md border border-zap-line bg-white p-4">
              <h2 className="font-semibold">Stage Timeline</h2>
              <div className="mt-4 space-y-3">
                {zap.steps.map((step) => (
                  <div className="rounded-md border border-zap-line bg-zap-fog px-3 py-2" key={step.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-sm">{step.id}</span>
                      <span className="rounded-md bg-white px-2 py-1 text-[11px] text-zap-muted">{step.kind}</span>
                    </div>
                    <p className="mt-1 truncate text-zap-muted text-xs">{step.model ?? "local"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {run ? (
            <div className="mt-4 rounded-md border border-zap-line bg-white p-4">
              <RunProgress fallbackStatus={run.status} runId={run.runId} />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { readonly icon: ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-zap-line bg-zap-fog p-3">
      <div className="flex items-center gap-2 text-zap-muted">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-2 font-semibold text-sm">{value}</p>
    </div>
  );
}
