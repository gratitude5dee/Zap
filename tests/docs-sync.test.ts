import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const hostedDocsRoot = path.resolve("docs");
const bundledDocsRoot = path.resolve("packages/cli/resources/docs");

function listMarkdownFiles(root: string, current = ""): string[] {
  const directory = path.join(root, current);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && (entry.name === ".mintlify" || entry.name === "node_modules")) return [];
    const relativePath = path.join(current, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(root, relativePath);
    return entry.isFile() && entry.name.endsWith(".md") ? [relativePath] : [];
  }).sort();
}

describe("docs sources", () => {
  it("keeps hosted Mintlify docs synchronized with bundled CLI docs", () => {
    const hostedFiles = listMarkdownFiles(hostedDocsRoot);
    const bundledFiles = listMarkdownFiles(bundledDocsRoot);

    expect(bundledFiles).toEqual(hostedFiles);

    for (const relativePath of hostedFiles) {
      const bundledFile = path.join(bundledDocsRoot, relativePath);
      expect(existsSync(bundledFile), `${relativePath} is missing from bundled CLI docs`).toBe(true);
      expect(readFileSync(bundledFile, "utf8")).toBe(readFileSync(path.join(hostedDocsRoot, relativePath), "utf8"));
    }
  });
});
