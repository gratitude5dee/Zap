export type SandboxResourceEnv = Readonly<Record<string, string | undefined>>;

export type SandboxResources = Readonly<{
  cpu: number;
  memoryMb: number;
  timeoutSeconds: number;
}>;

const STANDARD_SANDBOX_RESOURCES = {
  cpu: 2,
  memoryMb: 4096,
  timeoutSeconds: 900,
} as const satisfies SandboxResources;

export function resolveSandboxResources(
  env: SandboxResourceEnv = process.env,
): SandboxResources {
  return {
    cpu: integerEnv(env, "ZAP_SANDBOX_CPU", STANDARD_SANDBOX_RESOURCES.cpu),
    memoryMb: integerEnv(env, "ZAP_SANDBOX_MEMORY_MB", STANDARD_SANDBOX_RESOURCES.memoryMb),
    timeoutSeconds: integerEnv(
      env,
      "ZAP_SANDBOX_TIMEOUT_SECONDS",
      STANDARD_SANDBOX_RESOURCES.timeoutSeconds,
    ),
  };
}

export function resolveVercelSandboxOptions(resources: SandboxResources) {
  const representedMemoryMb = resources.cpu * 2048;
  if (resources.memoryMb !== representedMemoryMb) {
    throw new Error(
      `Vercel Sandbox allocates 2048 MB per vCPU; ${resources.cpu} vCPU represents ${representedMemoryMb} MB, not ${resources.memoryMb} MB.`,
    );
  }
  return {
    resources: { vcpus: resources.cpu },
    timeout: resources.timeoutSeconds * 1000,
  };
}

export function resolveBoxSandboxOptions(resources: SandboxResources) {
  return { ttlSeconds: resources.timeoutSeconds };
}

export function resolveDaytonaSandboxOptions(resources: SandboxResources) {
  if (resources.memoryMb % 1024 !== 0) {
    throw new Error(
      `Daytona resources express memory in whole GiB; received ${resources.memoryMb} MB.`,
    );
  }
  return {
    autoStopInterval: Math.max(1, Math.ceil(resources.timeoutSeconds / 60)),
    resources: {
      cpu: resources.cpu,
      memory: resources.memoryMb / 1024,
    },
  };
}

export function resolveE2BSandboxOptions(resources: SandboxResources) {
  return {
    create: { timeoutMs: resources.timeoutSeconds * 1000 },
    template: { cpuCount: resources.cpu, memoryMB: resources.memoryMb },
  };
}

function integerEnv(
  env: SandboxResourceEnv,
  key: "ZAP_SANDBOX_CPU" | "ZAP_SANDBOX_MEMORY_MB" | "ZAP_SANDBOX_TIMEOUT_SECONDS",
  fallback: number,
) {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer; received ${raw}.`);
  }
  return parsed;
}
