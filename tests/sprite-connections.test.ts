import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { resolveSpriteConnections } from "../lib/sprite-connections";

describe("Sprite connection composition", () => {
  it("keeps every MCP and resolves allowlisted plugin ids without silently dropping entries", () => {
    expect(resolveSpriteConnections([
      { id: "research", kind: "mcp", url: "https://research.example/mcp" },
      { id: "social", kind: "plugin" },
      { id: "assets", kind: "mcp", url: "https://assets.example/mcp" },
    ], JSON.stringify({
      social: { headers: { authorization: "Bearer plugin-token" }, url: "https://social.example/mcp" },
    }))).toEqual([
      { id: "research", kind: "mcp", url: "https://research.example/mcp" },
      { headers: { authorization: "Bearer plugin-token" }, id: "social", kind: "plugin", url: "https://social.example/mcp" },
      { id: "assets", kind: "mcp", url: "https://assets.example/mcp" },
    ]);
  });

  it("rejects unknown plugin ids instead of deploying an inert Sprite", () => {
    expect(() => resolveSpriteConnections([{ id: "unknown", kind: "plugin" }], "{}"))
      .toThrow(/unknown Sprite plugin/i);
  });

  it("rejects non-HTTPS MCP and plugin endpoints", () => {
    expect(() => resolveSpriteConnections([
      { id: "research", kind: "mcp", url: "http://research.example/mcp" },
    ])).toThrow(/HTTPS/i);
    expect(() => resolveSpriteConnections([
      { id: "social", kind: "plugin" },
    ], JSON.stringify({ social: { url: "http://social.example/mcp" } }))).toThrow(/HTTPS/i);
  });

  it("generates one authored Eve connection module per selected connection", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zap-sprite-connections-"));
    try {
      const resolved = [
        { id: "research", kind: "mcp", url: "https://research.example/mcp" },
        { id: "social", kind: "plugin", url: "https://social.example/mcp" },
        { id: "assets", kind: "mcp", url: "https://assets.example/mcp" },
      ];
      const result = spawnSync(process.execPath, [
        path.resolve("scripts/generate-sprite-connections.mjs"),
        "--root",
        root,
      ], {
        encoding: "utf8",
        env: { ...process.env, SPRITE_RESOLVED_CONNECTIONS: JSON.stringify(resolved) },
      });
      expect(result.status, result.stderr).toBe(0);
      const directory = path.join(root, "agent", "connections");
      const files = readdirSync(directory).filter((file) => file.startsWith("sprite-generated-"));
      expect(files).toHaveLength(3);
      expect(files).toEqual(expect.arrayContaining([
        "sprite-generated-assets.ts",
        "sprite-generated-research.ts",
        "sprite-generated-social.ts",
      ]));
      expect(readFileSync(path.join(directory, "sprite-generated-social.ts"), "utf8"))
        .toContain('runtimeSpriteConnection("social")');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
