import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const EXECUTION_MODES = new Map([
  ["vercel", "vercel"],
  ["convex", "convex"],
  ["world-convex", "convex"],
]);

export function resolveExecutionMode(value = process.env.ZAP_EXECUTION_MODE) {
  const raw = String(value ?? "vercel").trim().toLowerCase();
  const mode = EXECUTION_MODES.get(raw);
  if (!mode) {
    throw new Error(
      `Unsupported ZAP_EXECUTION_MODE=${JSON.stringify(raw)}. Expected vercel or convex.`,
    );
  }
  return mode;
}

export function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function relativeEvidence(root, path) {
  if (!root || !path) return null;
  const normalizedRoot = resolve(root).replace(/\/+$/, "");
  const normalizedPath = resolve(path);
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath;
}

export function sha256(path) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function vendorEveBundle({ serverDir, outputDir }) {
  const entry = join(serverDir, "_libs", "eve.mjs");
  if (!existsSync(entry)) {
    throw new Error(`Missing Eve server bundle: ${entry}`);
  }

  rmSync(outputDir, { force: true, recursive: true });
  mkdirSync(outputDir, { recursive: true });
  for (const name of ["_libs", "_virtual", "_runtime.mjs"]) {
    const source = join(serverDir, name);
    if (existsSync(source)) {
      cpSync(source, join(outputDir, name), { recursive: true });
    }
  }

  const vendoredEntry = join(outputDir, "_libs", "eve.mjs");
  const manifest = {
    entry: "_libs/eve.mjs",
    sha256: sha256(vendoredEntry),
    sizeBytes: statSync(vendoredEntry).size,
  };
  writeFileSync(
    join(outputDir, "world-convex-bundle.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

export function inspectWorldConvexSources({ adamRoot, bundlePath, zapRoot }) {
  const worldPackage = join(adamRoot, "packages", "world-convex", "package.json");
  const agentConfigPath = join(adamRoot, "apps", "agent", "agent", "agent.ts");
  const runnerPath = join(adamRoot, "packages", "backend", "convex", "runner", "engine.ts");
  const loaderPath = join(adamRoot, "packages", "backend", "convex", "runner", "bundle.ts");
  const httpPath = join(adamRoot, "packages", "backend", "convex", "http.ts");
  const uiPath = join(adamRoot, "packages", "backend", "convex", "ui.ts");
  const zapWebhookPath = join(zapRoot, "agent", "channels", "public-surfaces.ts");
  const runRailPath = join(zapRoot, "app", "studio", "run-rail.tsx");

  const packageText = readText(worldPackage);
  const agentConfig = readText(agentConfigPath);
  const runner = readText(runnerPath);
  const loader = readText(loaderPath);
  const convexHttp = readText(httpPath);
  const ui = readText(uiPath);
  const zapWebhooks = readText(zapWebhookPath);
  const runRail = readText(runRailPath);

  const worldPackagePresent =
    packageText.includes('"name": "world-convex"') &&
    existsSync(join(adamRoot, "packages", "world-convex", "src", "index.ts"));
  const eveSelectsWorld =
    agentConfig.includes('world: "world-convex"') &&
    agentConfig.includes('externalDependencies: ["world-convex"]');
  const inProcessNodeRunner =
    runner.startsWith('"use node"') &&
    runner.includes("bundle.POST(request)") &&
    runner.includes("runnerClaim");
  const vendoredBundlePresent = existsSync(bundlePath);
  const bundleInstallsWorld =
    vendoredBundlePresent && readText(bundlePath).includes("world-convex");

  const zapHasProviderWebhookSurface =
    zapWebhooks.includes("/providers/:provider/webhook") &&
    zapWebhooks.includes("recordProviderWebhook");
  const convexHasProviderWebhookBridge =
    /providers\/:?provider|providers\/\{provider\}|recordProviderWebhook/.test(convexHttp);

  const convexHasReactiveStreamQuery =
    ui.includes("sessionEvents") &&
    ui.includes("streamChunks") &&
    ui.includes("query({");
  const zapRailConsumesWorldStream =
    /sessionEvents|streamChunks|world-convex/.test(runRail);

  const usesLocalDynamicBundlePath =
    loader.includes("EVE_BUNDLE_PATH") &&
    loader.includes("await import(") &&
    loader.includes("bundlePath");

  return {
    evidence: {
      agentConfig: relativeEvidence(adamRoot, agentConfigPath),
      convexHttp: relativeEvidence(adamRoot, httpPath),
      loader: relativeEvidence(adamRoot, loaderPath),
      runRail: relativeEvidence(zapRoot, runRailPath),
      runner: relativeEvidence(adamRoot, runnerPath),
      ui: relativeEvidence(adamRoot, uiPath),
      worldPackage: relativeEvidence(adamRoot, worldPackage),
      zapWebhooks: relativeEvidence(zapRoot, zapWebhookPath),
    },
    checks: {
      bundleInstallsWorld,
      convexHasProviderWebhookBridge,
      convexHasReactiveStreamQuery,
      eveSelectsWorld,
      inProcessNodeRunner,
      usesLocalDynamicBundlePath,
      vendoredBundlePresent,
      worldPackagePresent,
      zapHasProviderWebhookSurface,
      zapRailConsumesWorldStream,
    },
  };
}

export function measureFreshImports(bundlePath, { samples = 7, timeoutMs = 20_000 } = {}) {
  if (!existsSync(bundlePath)) {
    return {
      available: false,
      bundle: null,
      error: "bundle-missing",
      importMs: [],
      processWallMs: [],
    };
  }

  const source = [
    "const started = performance.now();",
    "const loaded = await import(process.argv[1]);",
    "const elapsedMs = performance.now() - started;",
    "process.stdout.write(JSON.stringify({ elapsedMs, exports: Object.keys(loaded).length }));",
    "process.exit(0);",
  ].join("\n");

  const importMs = [];
  const processWallMs = [];
  const errors = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", source, pathToFileURL(bundlePath).href],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CONVEX_URL: process.env.CONVEX_URL ?? "http://127.0.0.1:3210",
          WORLD_CONVEX_DISABLE_PUMP: "1",
          WORLD_SERVICE_SECRET: process.env.WORLD_SERVICE_SECRET ?? "world-convex-probe-only",
          WORKFLOW_QUEUE_NAMESPACE: "zap_world_convex_probe",
        },
        timeout: timeoutMs,
      },
    );
    const wallMs = performance.now() - started;
    if (child.status !== 0) {
      errors.push((child.stderr || child.error?.message || "import failed").trim());
      continue;
    }
    try {
      const parsed = JSON.parse(child.stdout);
      importMs.push(Number(parsed.elapsedMs));
      processWallMs.push(wallMs);
    } catch (error) {
      errors.push(`invalid child output: ${String(error)}`);
    }
  }

  return {
    available: importMs.length === samples,
    bundle: {
      sha256: sha256(bundlePath),
      sizeBytes: statSync(bundlePath).size,
    },
    errors,
    importMs: importMs.map(roundMs),
    processWallMs: processWallMs.map(roundMs),
    summary: importMs.length
      ? {
          importP50Ms: roundMs(percentile(importMs, 50)),
          importP95Ms: roundMs(percentile(importMs, 95)),
          processWallP50Ms: roundMs(percentile(processWallMs, 50)),
          processWallP95Ms: roundMs(percentile(processWallMs, 95)),
          samples: importMs.length,
        }
      : null,
  };
}

function criterion(status, detail, evidence = {}) {
  return { detail, evidence, status };
}

export function evaluateWorldConvexSpike({ inspection, vercelBenchmark, worldBenchmark }) {
  const checks = inspection.checks;
  const comparable = Boolean(
    vercelBenchmark.available &&
      worldBenchmark.available &&
      vercelBenchmark.summary &&
      worldBenchmark.summary,
  );
  const ratio = comparable
    ? worldBenchmark.summary.processWallP95Ms /
      vercelBenchmark.summary.processWallP95Ms
    : null;

  const coldStart = comparable
    ? criterion(
        ratio <= 1 ? "proxy-pass" : "proxy-fail",
        "Fresh-process bundle import is a lower-bound proxy, not a deployed Convex action cold start.",
        {
          p95Ratio: Math.round(ratio * 1_000) / 1_000,
          vercelProcessWallP95Ms: vercelBenchmark.summary.processWallP95Ms,
          worldConvexProcessWallP95Ms: worldBenchmark.summary.processWallP95Ms,
        },
      )
    : criterion(
        "unverified",
        "Both Vercel and world-convex bundles are required for a comparable fresh-process measurement.",
      );

  const providerWebhooks = checks.zapHasProviderWebhookSurface
    ? criterion(
        checks.convexHasProviderWebhookBridge ? "pass" : "fail",
        checks.convexHasProviderWebhookBridge
          ? "Convex exposes a route that bridges Zap provider callbacks into the durable runtime."
          : "Zap declares provider callbacks, but the Convex HTTP router does not expose a callback bridge.",
      )
    : criterion("unverified", "The Zap provider callback surface was not found.");

  const streamTailing = checks.convexHasReactiveStreamQuery
    ? criterion(
        checks.zapRailConsumesWorldStream ? "pass" : "fail",
        checks.zapRailConsumesWorldStream
          ? "Zap's run rail consumes the Convex world stream."
          : "Adam exposes a reactive world-stream query, but Zap's run rail does not consume that stream.",
      )
    : criterion("fail", "No reactive Convex world-stream query was found.");

  const cloudBundle = criterion(
    checks.usesLocalDynamicBundlePath ? "fail" : "pass",
    checks.usesLocalDynamicBundlePath
      ? "The Convex action dynamically imports EVE_BUNDLE_PATH; that checkout path is unavailable in Convex Cloud."
      : "The vendored Eve bundle is deployable with the Convex action.",
  );

  const wiring = criterion(
    checks.worldPackagePresent &&
      checks.eveSelectsWorld &&
      checks.inProcessNodeRunner &&
      checks.bundleInstallsWorld
      ? "pass"
      : "fail",
    "The upstream fixture must select world-convex, vendor it into Eve, and invoke the workflow handler from a Convex Node action.",
    {
      bundleInstallsWorld: checks.bundleInstallsWorld,
      eveSelectsWorld: checks.eveSelectsWorld,
      inProcessNodeRunner: checks.inProcessNodeRunner,
      worldPackagePresent: checks.worldPackagePresent,
    },
  );

  const criteria = { cloudBundle, coldStart, providerWebhooks, streamTailing, wiring };
  const blocking = Object.entries(criteria)
    .filter(([, value]) =>
      ["fail", "proxy-fail", "unverified"].includes(value.status),
    )
    .map(([name]) => name);

  return {
    blockingCriteria: blocking,
    criteria,
    decision: blocking.length === 0 ? "GO" : "NO-GO",
  };
}
