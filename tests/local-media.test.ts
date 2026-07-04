import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { executeLocalMediaStep } from "../lib/local-media";
import type { ZapStep } from "../lib/zap-schema";

const execFileAsync = promisify(execFile);

describe("local media steps", () => {
  it("stitches real video segments with ffmpeg instead of forwarding the first URL", async () => {
    if (!(await hasBinary("ffmpeg"))) return;

    const dir = await mkdtemp(path.join(tmpdir(), "zap-local-media-"));
    try {
      const first = path.join(dir, "first.mp4");
      const second = path.join(dir, "second.mp4");
      await makeColorClip(first, "red");
      await makeColorClip(second, "blue");

      const result = await executeLocalMediaStep({
        inputUrls: [first, second],
        runId: "run_local_media",
        step: {
          id: "finalize",
          inputs: ["first", "second"],
          kind: "stitch",
        } as ZapStep,
      });

      expect(result.kind).toBe("mp4");
      expect(result.url).toMatch(/^\/generated\/runs\/run_local_media\/finalize\/Zap\.mp4$/);
      expect(result.url).not.toBe(first);
      await stat(path.join(process.cwd(), "public", result.url.slice(1)));
    } finally {
      await rm(dir, { force: true, recursive: true });
      await rm(path.join(process.cwd(), "public", "generated", "runs", "run_local_media"), { force: true, recursive: true });
    }
  });
});

async function hasBinary(name: string) {
  try {
    await execFileAsync(name, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function makeColorClip(filePath: string, color: string) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=160x90:d=0.25`,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    filePath,
  ]);
}
