import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { saveZapRecipe } from "../lib/save-zap";
import { extractLatestSavedZapDraft, isStudioZapDraft } from "../lib/studio-authoring";

describe("Studio authoring handoff", () => {
  it("extracts only a completed save_zap result and selects the latest draft", () => {
    const draft = extractLatestSavedZapDraft([
      {
        parts: [
          {
            output: { markdown: "old", slug: "old-zap" },
            state: "output-available",
            toolCallId: "old-call",
            toolName: "save_zap",
            type: "dynamic-tool",
          },
          {
            input: { markdown: "pending" },
            state: "approval-requested",
            toolCallId: "pending-call",
            toolName: "save_zap",
            type: "dynamic-tool",
          },
        ],
      },
      {
        parts: [{
          output: JSON.stringify({ markdown: "---\nzap: new-zap\n---", slug: "new-zap" }),
          state: "output-available",
          toolCallId: "new-call",
          toolName: "save_zap",
          type: "dynamic-tool",
        }],
      },
    ]);

    expect(draft).toEqual({
      markdown: "---\nzap: new-zap\n---",
      slug: "new-zap",
      toolCallId: "new-call",
    });
  });

  it("rejects malformed or unrelated browser event payloads", () => {
    expect(extractLatestSavedZapDraft([{ parts: [{
      output: { markdown: "recipe", slug: "unsafe slug" },
      state: "output-available",
      toolCallId: "call",
      toolName: "save_zap",
      type: "dynamic-tool",
    }] }])).toBeUndefined();
    expect(isStudioZapDraft({ markdown: "recipe", slug: "safe-zap", toolCallId: "call" })).toBe(true);
    expect(isStudioZapDraft({ markdown: "recipe", slug: "unsafe slug", toolCallId: "call" })).toBe(false);
  });

  it("links both private catalog entries and templates through the canonical Zap route", async () => {
    const source = await readFile(new URL("../app/studio/studio-rail.tsx", import.meta.url), "utf8");
    expect(source).toContain('href={`/zap/${zap.slug}`}');
    expect(source).toContain('href={`/zap/${template.slug}`}');
  });

  it("returns validated markdown without filesystem writes in hosted mode", async () => {
    const filesystem = {
      async mkdir() { throw new Error("hosted mode attempted mkdir"); },
      async writeFile() { throw new Error("hosted mode attempted writeFile"); },
    };

    await expect(saveZapRecipe({
      description: "Hosted draft",
      environment: { VERCEL: "1" },
      filesystem,
      markdown: "---\nzap: hosted-draft\n---",
      root: "/var/task",
      slug: "hosted-draft",
    })).resolves.toEqual({
      markdown: "---\nzap: hosted-draft\n---",
      mode: "validated-output",
      persisted: false,
      slug: "hosted-draft",
    });
  });

  it("packages Zap and skill files when running locally", async () => {
    const writes: Array<[string, string]> = [];
    const directories: string[] = [];
    const filesystem = {
      async mkdir(pathname: string) { directories.push(pathname); },
      async writeFile(pathname: string, contents: string) { writes.push([pathname, contents]); },
    };

    const result = await saveZapRecipe({
      description: "Local draft",
      environment: {},
      filesystem,
      markdown: "---\nzap: local-draft\n---",
      root: "/workspace",
      slug: "local-draft",
    });

    expect(result).toEqual({
      markdown: "---\nzap: local-draft\n---",
      mode: "local-package",
      path: "agent/skills/zap-local-draft/Zap.md",
      persisted: true,
      slug: "local-draft",
    });
    expect(directories).toEqual(["/workspace/agent/skills/zap-local-draft"]);
    expect(writes.map(([pathname]) => pathname)).toEqual([
      "/workspace/agent/skills/zap-local-draft/Zap.md",
      "/workspace/agent/skills/zap-local-draft/SKILL.md",
    ]);
    expect(writes[1]?.[1]).toContain("# Zap local-draft");
  });
});
