# Zap documentation agent instructions

Zap docs serve developers, creators, and coding agents building one-click generative media recipes on Eve.

## Product context

- A Zap recipe is a portable skill directory with `SKILL.md`, `Zap.md`, and prompt files.
- `Zap.md` frontmatter is the source of truth for inputs, budget caps, provider defaults, steps, repeats, and output.
- Mock mode is the default in docs and examples. Live provider spend always needs explicit user approval.
- Primary live provider is GMI Cloud. fal is the secondary provider. BYOK secret types include Runware, Prodia, OpenRouter, AI Gateway, AWS, GCP, and Vertex.
- Zap uses Convex for run state, Upstash Redis for idempotency and polling, Supabase for user-owned provider secrets, and Vercel for the web app.

## Writing standards

- Write direct developer docs in active voice.
- Prefer concrete commands, file paths, and expected outputs over conceptual prose.
- Keep examples TypeScript, shell, or Markdown unless a page requires another language.
- Mention the user-visible safety behavior for anything that can spend money or mutate production state.
- Use root-relative links inside the docs site.
- Use Mintlify components only when they make the page easier to scan.
- Keep root `docs/` as the hosted source and keep `packages/cli/resources/docs/` synchronized for `zap docs`.

## Validation

- Run `npm run docs:validate` before publishing docs changes.
- Run `npm run docs:links` after adding or changing links.
- Run `npm run cli -- docs quickstart` when changing content that is also bundled into the CLI.
