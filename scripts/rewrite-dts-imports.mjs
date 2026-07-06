import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2];

if (!root) {
  throw new Error("Usage: node scripts/rewrite-dts-imports.mjs <dist-dir>");
}

async function rewriteDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteDirectory(file);
      return;
    }
    if (!entry.isFile() || !entry.name.endsWith(".d.ts")) return;
    const source = await readFile(file, "utf8");
    const rewritten = source.replaceAll(".ts\"", ".js\"").replaceAll(".ts'", ".js'");
    if (source !== rewritten) await writeFile(file, rewritten);
  }));
}

await rewriteDirectory(root);
