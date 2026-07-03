import { promises as fs } from "node:fs";
import path from "node:path";

export type ZapSkillManifestEntry = {
  fileCount: number;
  hash: string;
  path: string;
  skill: string;
};

export type ZapSkillManifest = {
  generatedAt: string;
  skills: ZapSkillManifestEntry[];
  version: number;
};

export type ZapSkillDownload = ZapSkillManifestEntry & {
  downloadUrl?: string;
  jsonUrl?: string;
};

export type ZapSkillDownloadManifest = Omit<ZapSkillManifest, "skills"> & {
  skills: ZapSkillDownload[];
};

const skillsRoot = path.join(process.cwd(), "packages", "cli", "resources", "skills");
const manifestPath = path.join(skillsRoot, "skills-manifest.json");

export async function loadZapSkillManifest(): Promise<ZapSkillManifest> {
  return JSON.parse(await fs.readFile(manifestPath, "utf8")) as ZapSkillManifest;
}

export async function listZapSkillDownloads(origin?: string): Promise<ZapSkillDownloadManifest> {
  const manifest = await loadZapSkillManifest();
  return {
    ...manifest,
    skills: manifest.skills.map((entry) => ({
      ...entry,
      downloadUrl: origin ? `${origin}/api/skills/${entry.skill}` : undefined,
      jsonUrl: origin ? `${origin}/api/skills/${entry.skill}?format=json` : undefined,
    })),
  };
}

export async function readZapSkill(skill: string) {
  const manifest = await loadZapSkillManifest();
  const entry = manifest.skills.find((candidate) => candidate.skill === skill);
  if (!entry) return null;

  const file = path.join(skillsRoot, entry.skill, "SKILL.md");
  const relative = path.relative(skillsRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

  return {
    content: await fs.readFile(file, "utf8"),
    entry,
  };
}
