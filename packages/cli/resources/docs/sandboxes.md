# Sandbox Backends

`ZAP_SANDBOX_BACKEND` selects execution without changing a recipe or tool:

- `box` via `@asciidev/eve-box` (default everywhere, including the Vercel-hosted app)
- `vercel` via Vercel Sandbox
- `daytona` via `@daytonaio/sdk`
- `e2b` via `e2b`
- `docker` for local development
- `auto` for Eve's availability-aware default

Vendor SDKs load lazily only after selection. When `ZAP_SANDBOX_BACKEND` is omitted, Zap selects Box. Box uses `BOX_API_KEY` directly or resolves the allow-listed key from the server-authenticated Supabase managed-secret bridge; Daytona uses `DAYTONA_API_KEY`, and E2B uses `E2B_API_KEY`; Vercel uses the deployment OIDC token or a Vercel token. Sessions share the same Eve contract for command execution, byte/text files, process spawning, removal, path anchoring, state capture, and supported network policies.

Every Sprite preset emits `ZAP_SANDBOX_CPU`, `ZAP_SANDBOX_MEMORY_MB`, and `ZAP_SANDBOX_TIMEOUT_SECONDS`. The adapters validate these as positive integers and map them only to fields supported by the installed provider SDK:

| Backend | CPU and memory | Timeout |
| --- | --- | --- |
| Box | The Box v1 create surface does not expose CPU or memory selection, so the account's Box machine class applies. | Passed as the Box auto-archive `ttlSeconds`. |
| Vercel | Passed as `resources.vcpus`; Vercel fixes memory at 2048 MB per vCPU, so Zap rejects an incompatible memory value. | Passed to sandbox create in milliseconds. |
| Daytona | Enforced with the supported sandbox `resize` API after create/resume (a decrease is performed while stopped). Memory is converted from whole GiB. | Converted to Daytona's integer-minute idle auto-stop interval. |
| E2B | Passed to `Template.build` as `cpuCount` and `memoryMB`; Eve sessions launch from that sized template. | Passed to sandbox create, and reset on reconnect, in milliseconds. |
| Docker / `auto` | Eve's current Docker/default backend create options do not expose portable CPU or memory controls. Provider defaults apply. | Eve's current Docker/default backend create options do not expose a portable sandbox lifetime. |

Unsupported values are deliberately not forwarded under guessed vendor field names. This makes the difference between a declared preset and a provider-enforced limit visible during deployment and review.

The deterministic contract suite runs on every CI job with an in-memory driver and exposes opt-in live cases for every hosted backend:

```bash
npm run test:sandboxes
RUN_HOSTED_SANDBOX_TESTS=1 npm run test:sandboxes
RUN_LOCAL_SANDBOX_TESTS=1 npm run test:sandboxes
```

Live cases skip individually when their credential is absent, so CI never creates paid infrastructure by accident.
