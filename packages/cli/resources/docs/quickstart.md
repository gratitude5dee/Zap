# Quickstart

Create a lightweight Zap project, scaffold a recipe, validate it, and run a zero-spend mock pipeline.

```bash
npx @zap-md/cli init demo --non-interactive
cd demo
npx zap validate
npx zap new my-test
npx zap run my-test --input PROMPT="A bright launch bumper" --json
npx zap status
```

Mock mode fills missing required inputs with deterministic placeholders. Live provider execution requires `--live` plus the provider keys and budget approval.

For coding-agent setup, see:

```bash
npx zap docs agents
```
