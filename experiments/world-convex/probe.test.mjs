import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  evaluateWorldConvexSpike,
  inspectWorldConvexSources,
  measureFreshImports,
  percentile,
  resolveExecutionMode,
  vendorEveBundle,
} from "./probe-core.mjs";

function temp(name) {
  const root = join(tmpdir(), `zap-world-convex-${name}-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function put(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, value);
}

test("execution mode keeps Vercel as the default and accepts the spike alias", () => {
  assert.equal(resolveExecutionMode(undefined), "vercel");
  assert.equal(resolveExecutionMode("convex"), "convex");
  assert.equal(resolveExecutionMode("world-convex"), "convex");
  assert.throws(() => resolveExecutionMode("production-convex"), /Unsupported/);
});

test("percentile uses the nearest-rank method", () => {
  assert.equal(percentile([9, 1, 3, 5], 50), 3);
  assert.equal(percentile([9, 1, 3, 5], 95), 9);
  assert.equal(percentile([], 95), null);
});

test("vendoring copies runtime payload but not the Nitro entrypoint", () => {
  const root = temp("vendor");
  const server = join(root, "server");
  const output = join(root, "vendored");
  put(join(server, "_libs", "eve.mjs"), "export const B = () => 'ok';\n");
  put(join(server, "_runtime.mjs"), "export const runtime = true;\n");
  put(join(server, "index.mjs"), "throw new Error('must not be copied');\n");

  const manifest = vendorEveBundle({ outputDir: output, serverDir: server });
  assert.equal(manifest.entry, "_libs/eve.mjs");
  assert.equal(typeof manifest.sha256, "string");
  assert.match(readFileSync(join(output, "_libs", "eve.mjs"), "utf8"), /export const B/);
  assert.throws(() => readFileSync(join(output, "index.mjs"), "utf8"));
});

test("fresh import benchmark measures an isolated vendored module", () => {
  const root = temp("benchmark");
  const bundle = join(root, "eve.mjs");
  put(bundle, "export const B = async () => new Response('ok');\n");
  const measured = measureFreshImports(bundle, { samples: 2 });
  assert.equal(measured.available, true);
  assert.equal(measured.summary.samples, 2);
  assert.ok(measured.summary.processWallP95Ms > 0);
  assert.equal(measured.errors.length, 0);
});

test("inspection distinguishes Adam wiring from missing Zap integrations", () => {
  const root = temp("inspection");
  const adam = join(root, "adam");
  const zap = join(root, "zap");
  const bundle = join(adam, "packages/backend/eve-runtime/bundle/_libs/eve.mjs");
  put(
    join(adam, "packages/world-convex/package.json"),
    '{"name": "world-convex"}\n',
  );
  put(join(adam, "packages/world-convex/src/index.ts"), "export function createWorld() {}\n");
  put(
    join(adam, "apps/agent/agent/agent.ts"),
    'world: "world-convex"\nexternalDependencies: ["world-convex"]\n',
  );
  put(
    join(adam, "packages/backend/convex/runner/engine.ts"),
    '"use node";\nrunnerClaim;\nawait bundle.POST(request);\n',
  );
  put(
    join(adam, "packages/backend/convex/runner/bundle.ts"),
    'const bundlePath = process.env.EVE_BUNDLE_PATH; await import(bundlePath);\n',
  );
  put(join(adam, "packages/backend/convex/http.ts"), "export default http;\n");
  put(
    join(adam, "packages/backend/convex/ui.ts"),
    "export const sessionEvents = query({ streamChunks });\n",
  );
  put(bundle, "// world-convex\nexport const B = true;\n");
  put(
    join(zap, "agent/channels/public-surfaces.ts"),
    '/providers/:provider/webhook\nrecordProviderWebhook\n',
  );
  put(join(zap, "app/studio/run-rail.tsx"), "setInterval(refresh, 3000);\n");

  const inspection = inspectWorldConvexSources({ adamRoot: adam, bundlePath: bundle, zapRoot: zap });
  assert.equal(inspection.checks.worldPackagePresent, true);
  assert.equal(inspection.checks.inProcessNodeRunner, true);
  assert.equal(inspection.checks.convexHasProviderWebhookBridge, false);
  assert.equal(inspection.checks.convexHasReactiveStreamQuery, true);
  assert.equal(inspection.checks.zapRailConsumesWorldStream, false);
  assert.equal(inspection.checks.usesLocalDynamicBundlePath, true);
});

test("critical compatibility failures force a NO-GO", () => {
  const inspection = {
    checks: {
      bundleInstallsWorld: true,
      convexHasProviderWebhookBridge: false,
      convexHasReactiveStreamQuery: true,
      eveSelectsWorld: true,
      inProcessNodeRunner: true,
      usesLocalDynamicBundlePath: true,
      worldPackagePresent: true,
      zapHasProviderWebhookSurface: true,
      zapRailConsumesWorldStream: false,
    },
  };
  const vercelBenchmark = {
    available: true,
    summary: { processWallP95Ms: 100 },
  };
  const worldBenchmark = {
    available: true,
    summary: { processWallP95Ms: 110 },
  };
  const result = evaluateWorldConvexSpike({
    inspection,
    vercelBenchmark,
    worldBenchmark,
  });
  assert.equal(result.decision, "NO-GO");
  assert.deepEqual(result.blockingCriteria.sort(), [
    "cloudBundle",
    "coldStart",
    "providerWebhooks",
    "streamTailing",
  ]);
  assert.equal(result.criteria.coldStart.status, "proxy-fail");
  assert.equal(result.criteria.wiring.status, "pass");
});
