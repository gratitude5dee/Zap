import { z } from "zod";
import type { SpriteSpec } from "@wzrdtech/core";

const headersSchema = z.record(z.string(), z.string()).optional();
const httpsUrlSchema = z.string().url().refine(
  (value) => new URL(value).protocol === "https:",
  "Sprite connection endpoints must use HTTPS.",
);
const resolvedConnectionSchema = z.object({
  headers: headersSchema,
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,127}$/),
  kind: z.enum(["mcp", "plugin"]),
  url: httpsUrlSchema,
}).strict();
const pluginCatalogSchema = z.record(z.string(), z.object({
  headers: headersSchema,
  url: httpsUrlSchema,
}).strict());

export type ResolvedSpriteConnection = z.infer<typeof resolvedConnectionSchema>;

export function resolveSpriteConnections(
  connections: SpriteSpec["connections"],
  pluginCatalogJson = process.env.SPRITE_PLUGIN_CATALOG_JSON,
): ResolvedSpriteConnection[] {
  const needsCatalog = connections.some((connection) => connection.kind === "plugin");
  const catalog = needsCatalog ? parsePluginCatalog(pluginCatalogJson) : {};
  return connections.map((connection) => {
    if (connection.kind === "mcp") {
      return resolvedConnectionSchema.parse(connection);
    }
    const plugin = catalog[connection.id];
    if (!plugin) {
      throw new Error(`Unknown Sprite plugin ${connection.id}. Add an allowlisted entry to SPRITE_PLUGIN_CATALOG_JSON before deploying.`);
    }
    return resolvedConnectionSchema.parse({ ...plugin, id: connection.id, kind: "plugin" });
  });
}

export function runtimeSpriteConnection(id: string, env: Readonly<Record<string, string | undefined>> = process.env) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.SPRITE_RESOLVED_CONNECTIONS ?? "[]");
  } catch (error) {
    throw new Error("SPRITE_RESOLVED_CONNECTIONS must be valid JSON.", { cause: error });
  }
  const connections = z.array(resolvedConnectionSchema).parse(parsed);
  const connection = connections.find((candidate) => candidate.id === id);
  if (!connection) throw new Error(`Resolved Sprite connection ${id} is missing at runtime.`);
  return connection;
}

function parsePluginCatalog(value?: string) {
  if (!value?.trim()) return {};
  try {
    return pluginCatalogSchema.parse(JSON.parse(value));
  } catch (error) {
    throw new Error("SPRITE_PLUGIN_CATALOG_JSON must map allowlisted plugin ids to HTTPS MCP endpoints.", { cause: error });
  }
}
