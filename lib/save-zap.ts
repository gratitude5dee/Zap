import { promises as fs } from "node:fs";
import path from "node:path";

type SaveZapFileSystem = {
  mkdir(pathname: string, options: { recursive: true }): Promise<unknown>;
  writeFile(pathname: string, contents: string): Promise<unknown>;
};

type SaveZapEnvironment = Record<string, string | undefined>;

type SaveZapInput = {
  description: string;
  environment?: SaveZapEnvironment;
  filesystem?: SaveZapFileSystem;
  markdown: string;
  root?: string;
  slug: string;
};

export type SaveZapResult = {
  markdown: string;
  slug: string;
} & ({
  mode: "local-package";
  path: string;
  persisted: true;
} | {
  mode: "validated-output";
  persisted: false;
});

export async function saveZapRecipe(input: SaveZapInput): Promise<SaveZapResult> {
  const mode = resolveSaveZapMode(input.environment ?? process.env);
  if (mode === "validated-output") {
    return {
      markdown: input.markdown,
      mode,
      persisted: false,
      slug: input.slug,
    };
  }

  const filesystem = input.filesystem ?? fs;
  const relativePath = `agent/skills/zap-${input.slug}/Zap.md`;
  const directory = path.join(input.root ?? process.cwd(), "agent", "skills", `zap-${input.slug}`);
  await filesystem.mkdir(directory, { recursive: true });
  await filesystem.writeFile(path.join(directory, "Zap.md"), input.markdown);
  await filesystem.writeFile(path.join(directory, "SKILL.md"), skillWrapper(input.description, input.slug));
  return {
    markdown: input.markdown,
    mode,
    path: relativePath,
    persisted: true,
    slug: input.slug,
  };
}

export function resolveSaveZapMode(environment: SaveZapEnvironment): SaveZapResult["mode"] {
  return environment.VERCEL === "1"
    || Boolean(environment.VERCEL_ENV?.trim())
    || Boolean(environment.AWS_LAMBDA_FUNCTION_NAME?.trim())
    || Boolean(environment.LAMBDA_TASK_ROOT?.trim())
    ? "validated-output"
    : "local-package";
}

function skillWrapper(description: string, slug: string) {
  return `---\ndescription: ${JSON.stringify(description)}\n---\n\n# Zap ${slug}\n\nExecutable Zap frontmatter and creative direction live in ./Zap.md. Use this skill when authoring or running the ${slug} recipe.\n`;
}
