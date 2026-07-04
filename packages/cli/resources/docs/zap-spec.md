# Zap Spec

`Zap.md` is the source of truth for a one-shot content recipe. It lives inside an Eve skill directory:

```text
agent/skills/zap-<slug>/
  SKILL.md
  Zap.md
  prompts/*.md
```

Minimum valid frontmatter:

```yaml
---
zap: launch-trailer
version: 1
description: A short creator video.
budget:
  estimate_usd: 0
  cap_usd: 5
defaults:
  provider: mock
  aspect: "9:16"
inputs:
  PROMPT:
    type: textarea
    label: Prompt
    required: true
steps:
  - id: initial_frame
    kind: image.gen
    provider: mock
    model: mock-image
    prompt: prompts/initial-frame.md
  - id: initial_gen
    kind: video.gen
    provider: mock
    model: mock-video
    inputs: [initial_frame]
    duration_s: 15
    retry:
      max: 2
      backoff_s: 3
      fallback_provider: fal
    prompt: prompts/initial-gen.md
  - id: stitch
    kind: stitch
    inputs: [initial_gen]
output: Zap.mp4
---
```

Rules agents must preserve:

- Every `steps[].id` is unique.
- Prompt variables like `{PROMPT}` must exist in `inputs`.
- `budget.estimate_usd` must not exceed `budget.cap_usd`.
- Mock provider is valid for tests and demos.
- Live provider runs require explicit `--live` or authenticated web confirmation.
- Provider-backed steps may define `retry.max`, `retry.backoff_s`,
  `retry.fallback_provider`, and `retry.fallback_model` for bounded repair.

Validate after every recipe edit:

```bash
npx @wzrdtech/zap@0.1.0 validate
npx @wzrdtech/zap@0.1.0 lint
```
