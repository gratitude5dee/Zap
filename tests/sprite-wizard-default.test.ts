import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Sprite wizard defaults", () => {
  it("defaults new Sprites to ascii.dev Box and presents Box first", async () => {
    const source = await readFile(new URL("../app/studio/sprite-wizard.tsx", import.meta.url), "utf8");

    expect(source).toContain('useState<SpriteSpec["sandbox"]>("box-standard")');
    expect(source).toContain('options={["box-standard", "vercel-standard", "daytona-standard", "e2b-standard", "docker-local"]}');
  });
});
