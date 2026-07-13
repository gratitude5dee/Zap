import "server-only";
import { createHash } from "node:crypto";
import { Vercel } from "@vercel/sdk";
import type { SpriteSpec } from "@wzrdtech/core";
import type { SpriteComposioSession } from "./sprite-composio";
import { assertChannelEnvironment } from "./channel-runtime";
import { spriteEnvironment } from "./sprite-environment";
import type { SpriteRecord } from "./sprite-store";

export type SpriteDeployment = {
  deploymentId: string;
  deploymentUrl: string;
  projectId: string;
  projectName: string;
  status: "deploying" | "ready" | "error";
};

export async function deploySpriteToVercel(input: {
  authorId: string;
  composio: SpriteComposioSession | null;
  existing?: SpriteRecord | null;
  manifest: string;
  spec: SpriteSpec;
}): Promise<SpriteDeployment> {
  assertChannelEnvironment(input.spec.channels);
  const config = deploymentConfig();
  const vercel = new Vercel({ bearerToken: config.token });
  const projectName = input.existing?.projectName ?? spriteProjectName(input.authorId);
  const variables = spriteEnvironment(input);
  let projectId = input.existing?.projectId;

  if (!projectId) {
    const project = await vercel.projects.createProject({
      teamId: config.teamId,
      requestBody: {
        environmentVariables: variables,
        framework: "eve",
        gitRepository: { repo: config.repo, type: "github" },
        name: projectName,
        rootDirectory: config.rootDirectory,
      },
    });
    projectId = project.id;
  } else {
    await vercel.projects.createProjectEnv({
      idOrName: projectId,
      teamId: config.teamId,
      upsert: "true",
      requestBody: variables.map((variable) => ({
        ...variable,
        customEnvironmentIds: [],
        target: ["production", "preview"],
      })),
    });
  }

  const deployment = await vercel.deployments.createDeployment({
    forceNew: "1",
    teamId: config.teamId,
    requestBody: {
      gitSource: { ref: config.ref, repoId: config.repoId, type: "github" },
      meta: { sprite: input.spec.sprite },
      name: projectName,
      project: projectId,
      target: "production",
    },
  });
  return {
    deploymentId: deployment.id,
    deploymentUrl: `https://${deployment.url}`,
    projectId,
    projectName,
    status: mapDeploymentStatus(deployment.readyState),
  };
}

export async function getSpriteVercelDeployment(deploymentId: string) {
  const config = deploymentConfig();
  const deployment = await new Vercel({ bearerToken: config.token }).deployments.getDeployment({
    idOrUrl: deploymentId,
    teamId: config.teamId,
  });
  return {
    deploymentError: deployment.errorMessage ?? undefined,
    deploymentUrl: deployment.url ? `https://${deployment.url}` : undefined,
    status: mapDeploymentStatus(deployment.readyState),
  };
}

function deploymentConfig() {
  const token = process.env.SPRITE_VERCEL_TOKEN ?? process.env.VERCEL_TOKEN;
  const teamId = process.env.SPRITE_VERCEL_TEAM_ID;
  const repo = process.env.SPRITE_VERCEL_GIT_REPO;
  const repoId = process.env.SPRITE_VERCEL_GIT_REPO_ID;
  if (!token || !teamId || !repo || !repoId) {
    throw new Error("SPRITE_VERCEL_TOKEN, SPRITE_VERCEL_TEAM_ID, SPRITE_VERCEL_GIT_REPO, and SPRITE_VERCEL_GIT_REPO_ID are required.");
  }
  return {
    ref: process.env.SPRITE_VERCEL_GIT_REF ?? "main",
    repo,
    repoId,
    rootDirectory: process.env.SPRITE_VERCEL_ROOT_DIRECTORY ?? null,
    teamId,
    token,
  };
}

function spriteProjectName(authorId: string) {
  const suffix = createHash("sha256").update(authorId).digest("hex").slice(0, 12);
  return `zap-sprite-${suffix}`;
}

function mapDeploymentStatus(value: string | null | undefined): SpriteDeployment["status"] {
  if (value === "READY") return "ready";
  if (value === "ERROR" || value === "CANCELED" || value === "BLOCKED") return "error";
  return "deploying";
}
