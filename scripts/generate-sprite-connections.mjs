import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const rootIndex = process.argv.indexOf("--root");
const root = path.resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : process.cwd());
const directory = path.join(root, "agent", "connections");
await mkdir(directory, { recursive: true });

for (const file of await readdir(directory)) {
  if (/^sprite-generated-[a-z0-9_-]+\.ts$/.test(file)) await rm(path.join(directory, file));
}

let connections;
try {
  connections = JSON.parse(process.env.SPRITE_RESOLVED_CONNECTIONS ?? "[]");
} catch (error) {
  throw new Error("SPRITE_RESOLVED_CONNECTIONS must be valid JSON before building a Sprite.", { cause: error });
}
if (!Array.isArray(connections)) throw new Error("SPRITE_RESOLVED_CONNECTIONS must be an array.");

const ids = new Set();
for (const connection of connections) {
  const id = connection?.id;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{1,127}$/.test(id)) {
    throw new Error(`Invalid resolved Sprite connection id: ${String(id)}.`);
  }
  if (ids.has(id)) throw new Error(`Duplicate resolved Sprite connection id: ${id}.`);
  ids.add(id);
  const source = `import { defineMcpClientConnection } from "eve/connections";
import { once } from "eve/tools/approval";
import { runtimeSpriteConnection } from "../../lib/sprite-connections.js";

const connection = runtimeSpriteConnection(${JSON.stringify(id)});

export default defineMcpClientConnection({
  approval: once(),
  description: \`User-selected Sprite \${connection.kind} connection: \${connection.id}.\`,
  headers: connection.headers,
  url: connection.url,
});
`;
  await writeFile(path.join(directory, `sprite-generated-${id}.ts`), source, "utf8");
}

console.log(`Generated ${ids.size} Sprite connection module${ids.size === 1 ? "" : "s"}.`);
