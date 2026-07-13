#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateWorldConvexSpike,
  inspectWorldConvexSources,
  measureFreshImports,
  resolveExecutionMode,
} from "./probe-core.mjs";

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function integerOption(args, name, fallback) {
  const value = Number(option(args, name, fallback));
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`${name} must be an integer between 1 and 100.`);
  }
  return value;
}

function packageVersion(path, dependency) {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return dependency
    ? parsed.dependencies?.[dependency] ?? parsed.devDependencies?.[dependency] ?? null
    : parsed.version ?? null;
}

const here = dirname(fileURLToPath(import.meta.url));
const defaultZapRoot = resolve(here, "../..");
const args = process.argv.slice(2);
const zapRoot = resolve(option(args, "--zap-root", defaultZapRoot));
const adamRoot = resolve(
  option(args, "--adam-root", process.env.ADAM_ROOT ?? join(zapRoot, "..", "adam-main")),
);
const vercelBundlePath = resolve(
  option(
    args,
    "--vercel-bundle",
    join(zapRoot, ".vercel", "output", "functions", "__server.func", "_libs", "eve.mjs"),
  ),
);
const worldBundlePath = resolve(
  option(
    args,
    "--world-bundle",
    join(adamRoot, "packages", "backend", "eve-runtime", "bundle", "_libs", "eve.mjs"),
  ),
);
const samples = integerOption(args, "--samples", 7);
const output = option(args, "--output", null);
const mode = resolveExecutionMode(option(args, "--mode", process.env.ZAP_EXECUTION_MODE));

const report = {
  environment: {
    arch: process.arch,
    node: process.version,
    platform: process.platform,
  },
  generatedAt: new Date().toISOString(),
  mode,
  productionDefault: "vercel",
  schemaVersion: 1,
  versions: {
    adamEve: packageVersion(join(adamRoot, "apps", "agent", "package.json"), "eve"),
    zapEve: packageVersion(join(zapRoot, "package.json"), "eve"),
    zapPlatform: packageVersion(join(zapRoot, "package.json")),
  },
};

if (mode === "vercel") {
  Object.assign(report, {
    decision: "PRODUCTION-DEFAULT",
    note: "The spike is inactive. Set ZAP_EXECUTION_MODE=convex to run the world-convex assessment.",
  });
} else {
  const inspection = inspectWorldConvexSources({
    adamRoot,
    bundlePath: worldBundlePath,
    zapRoot,
  });
  const vercelBenchmark = measureFreshImports(vercelBundlePath, { samples });
  const worldBenchmark = measureFreshImports(worldBundlePath, { samples });
  Object.assign(report, {
    artifacts: {
      upstreamFixtureAvailable: existsSync(adamRoot),
      vercelBundleAvailable: existsSync(vercelBundlePath),
      worldConvexBundleAvailable: existsSync(worldBundlePath),
    },
    benchmarks: {
      measurement: "fresh Node process + dynamic import; lower-bound proxy only",
      vercel: vercelBenchmark,
      worldConvex: worldBenchmark,
    },
    inspection,
    result: evaluateWorldConvexSpike({ inspection, vercelBenchmark, worldBenchmark }),
  });
  report.decision = report.result.decision;
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  const path = resolve(output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialized);
}

if (args.includes("--json")) {
  process.stdout.write(serialized);
} else {
  console.log(`world-convex spike: ${report.decision}`);
  console.log(`production default: ${report.productionDefault}`);
  if (report.result) {
    for (const [name, value] of Object.entries(report.result.criteria)) {
      console.log(`- ${name}: ${value.status} — ${value.detail}`);
    }
  } else {
    console.log(report.note);
  }
  if (output) console.log(`report: ${resolve(output)}`);
}
