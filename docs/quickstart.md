# Quickstart

Create a lightweight Zap project, scaffold a recipe, validate it, and run a zero-spend mock pipeline.

```bash
npx @wzrdtech/zap init demo --non-interactive
cd demo
npm install
npm run zap:validate
npm run zap:new -- my-test
npm run zap:run -- my-test --input PROMPT="A bright launch bumper" --json
npm run zap:status
```

Mock mode fills missing required inputs with deterministic placeholders. Live provider execution requires `--live` plus the provider keys and budget approval.

For coding-agent setup, see:

```bash
npx @wzrdtech/zap docs agents
```
