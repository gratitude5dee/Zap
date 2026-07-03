# Zap

Zap is a lightweight content agent framework built on Eve. A Zap is a one-shot generative recipe that turns creator inputs into a finished media artifact through a repeatable pipeline.

## What Ships

- Agent skills: `SKILL.md`, `Zap.md`, and prompt files.
- CLI: create, validate, lint, run, inspect, and share recipes.
- Web studio: creator-friendly Zap runner and agent workspace.
- Runtime: Convex run state, Upstash idempotency and polling queues, provider adapters, and optional HyperFrames stitching.

## Default Workflow

```bash
npx @wzrdtech/zap init my-zap-app
cd my-zap-app
npx @wzrdtech/zap new launch-trailer
npx @wzrdtech/zap validate
npx @wzrdtech/zap run agent/skills/zap-launch-trailer/Zap.md --json
```

Mock mode is the default. Use live provider generation only after budgets, keys, and creator approval are in place.
