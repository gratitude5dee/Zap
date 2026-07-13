import type { SandboxBackend } from "eve/sandbox";
import type { Sandbox as DaytonaSandbox } from "@daytonaio/sdk";
import { createVendorBackend } from "./backend";
import {
  resolveDaytonaSandboxOptions,
  resolveSandboxResources,
  type SandboxResources,
} from "./resources";
import type { SandboxDriver } from "./session";

export async function daytonaBackend(options: {
  apiKey?: string;
  resources?: ReturnType<typeof resolveDaytonaSandboxOptions>["resources"];
  timeoutSeconds?: SandboxResources["timeoutSeconds"];
} = {}): Promise<SandboxBackend> {
  const apiKey = options.apiKey ?? process.env.DAYTONA_API_KEY;
  if (!apiKey) throw new Error("DAYTONA_API_KEY is required when ZAP_SANDBOX_BACKEND=daytona.");
  const defaultResources = resolveSandboxResources();
  const defaults = resolveDaytonaSandboxOptions(defaultResources);
  const resources = options.resources ?? defaults.resources;
  const autoStopInterval = Math.max(
    1,
    Math.ceil((options.timeoutSeconds ?? defaultResources.timeoutSeconds) / 60),
  );
  const { Daytona: DaytonaClient } = await import("@daytonaio/sdk");
  const client = new DaytonaClient({ apiKey });
  return createVendorBackend({
    name: "daytona",
    templateName: templateName,
    async prewarmDriver(name) {
      const sandbox = await client.create({
        autoArchiveInterval: 60,
        autoStopInterval,
        labels: { runtime: "eve", template: name },
        language: "typescript",
        name: `${name}-prewarm`,
      });
      await enforceDaytonaResources(sandbox, resources);
      return daytonaDriver(sandbox, async () => {
        await sandbox._experimental_createSnapshot(name);
        await sandbox.stop();
      });
    },
    async createDriver(input, snapshot) {
      const existing = stringMetadata(input.existingMetadata, "sandboxId");
      const sandbox = existing
        ? await client.get(existing)
        : await client.create({
          autoArchiveInterval: 60,
          autoStopInterval,
          labels: input.tags,
          language: "typescript",
          name: `zap-${input.sessionKey.slice(0, 36)}`,
          ...(snapshot ? { snapshot } : {}),
        });
      if (existing) await sandbox.start();
      await enforceDaytonaResources(sandbox, resources);
      return daytonaDriver(sandbox, () => sandbox.stop());
    },
  });
}

export async function enforceDaytonaResources(
  sandbox: Pick<DaytonaSandbox, "cpu" | "memory" | "resize" | "start" | "stop">,
  resources: { cpu: number; memory: number },
) {
  if (sandbox.cpu === resources.cpu && sandbox.memory === resources.memory) return;
  const requiresRestart = sandbox.cpu > resources.cpu || sandbox.memory > resources.memory;
  if (requiresRestart) await sandbox.stop();
  await sandbox.resize(resources);
  if (requiresRestart) await sandbox.start();
}

function daytonaDriver(sandbox: DaytonaSandbox, shutdown: () => Promise<void>): SandboxDriver {
  return {
    id: sandbox.id,
    async read(remotePath) {
      try { return new Uint8Array(await sandbox.fs.downloadFile(remotePath)); } catch { return null; }
    },
    async remove(remotePath, recursive, force) {
      await sandbox.process.executeCommand(`rm ${recursive ? "-r " : ""}${force ? "-f " : ""}-- ${shellQuote(remotePath)}`);
    },
    async run(input) {
      input.abortSignal?.throwIfAborted();
      const result = await sandbox.process.executeCommand(input.command, input.workingDirectory, input.env);
      return { exitCode: result.exitCode, stderr: "", stdout: result.result };
    },
    async setNetworkPolicy(policy) {
      await sandbox.updateNetworkSettings({ networkBlockAll: policy === "deny-all" });
    },
    shutdown,
    async write(remotePath, content) { await sandbox.fs.uploadFile(Buffer.from(content), remotePath); },
  };
}

function templateName(key: string) { return `zap-eve-${key.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 48)}`; }
function shellQuote(value: string) { return `'${value.replace(/'/g, `'"'"'`)}'`; }
function stringMetadata(value: Record<string, unknown> | undefined, key: string) { return typeof value?.[key] === "string" ? value[key] : undefined; }
