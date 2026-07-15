import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getOEmbed } from "../app/api/oembed/route.ts";
import { listZapSpecs, loadPublicZapSpec, loadZapFromSkill, loadZapSpec } from "../lib/zap-files.ts";

describe("private Zap visibility", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps Air available to internal recovery while hiding it from public loaders and listings", async () => {
    vi.stubEnv("CONVEX_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");

    await expect(loadZapSpec("air-imessage-video")).resolves.toMatchObject({ zap: "air-imessage-video" });
    await expect(loadPublicZapSpec("air-imessage-video")).resolves.toBeNull();
    await expect(loadZapFromSkill("air-imessage-video")).resolves.toBeNull();
    await expect(loadPublicZapSpec("world-cup-entrance")).resolves.toMatchObject({ zap: "world-cup-entrance" });

    const publicZaps = await listZapSpecs();
    expect(publicZaps.map((zap) => zap.zap)).not.toContain("air-imessage-video");
  });

  it("returns 404 from oEmbed for the private Air slug", async () => {
    vi.stubEnv("CONVEX_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");

    const response = await getOEmbed(new Request(
      "https://zap.test/api/oembed?url=https%3A%2F%2Fzap.test%2Fair-imessage-video",
    ));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Zap not found." });
  });
});
