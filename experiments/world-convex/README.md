# world-convex execution spike

This directory is an executable **feasibility probe**, not a second production
backend. It evaluates the `world-convex` implementation in the sibling
`adam-main` input against Zap's current Eve bundle and the three G10 gates.
It never changes the deployed runtime, Convex schema, or `ZAP_EXECUTION_MODE`
used by the Next.js application.

Run the measured probe after `npm run eve:build`:

```bash
ZAP_EXECUTION_MODE=convex node experiments/world-convex/run-spike.mjs \
  --samples 7 \
  --output experiments/world-convex/results/latest.json
```

Override the input checkout or bundles when reproducing elsewhere:

```bash
ADAM_ROOT=/path/to/adam-main \
ZAP_EXECUTION_MODE=world-convex \
node experiments/world-convex/run-spike.mjs \
  --vercel-bundle /path/to/zap-eve-bundle/_libs/eve.mjs \
  --world-bundle /path/to/adam-eve-bundle/_libs/eve.mjs \
  --json
```

The cold-start number is deliberately labelled a lower-bound proxy: every
sample starts a fresh Node process and imports the full vendored Eve module,
but it does not include Convex Cloud action scheduling. Provider callback and
stream-tail gates are source/integration checks. The decision is `NO-GO` if a
required gate fails or is unverified.

Tests use only Node's standard library:

```bash
node --test experiments/world-convex/probe.test.mjs
```

Why this stops at a probe: the upstream implementation dynamically imports a
checkout-local `EVE_BUNDLE_PATH`. Adam documents that this works for local
Convex development but not Convex Cloud. Copying its tables into Zap before a
cloud-portable bundle loader, provider-webhook bridge, and authenticated
world-stream adapter exist would create a backend that cannot satisfy G10 in
production. The measured result and promotion criteria live in
`docs/convex.md`.

