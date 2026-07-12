import { afterEach, describe, expect, it } from "vitest";
import { spriteEnvironment } from "../lib/sprite-environment";

const originalBoxApiKey = process.env.BOX_API_KEY;

afterEach(() => {
  if (originalBoxApiKey === undefined) delete process.env.BOX_API_KEY;
  else process.env.BOX_API_KEY = originalBoxApiKey;
});

describe("Sprite Vercel deployment environment", () => {
  it("inherits the ascii.dev Box credential for a Box-backed Sprite", () => {
    process.env.BOX_API_KEY = "box_test_key";

    const variables = spriteEnvironment({
      authorId: "wallet:0x1234",
      composio: null,
      manifest: "---\nsprite: test-sprite\n---",
      spec: {
        channels: [],
        connections: [],
        connectors: [],
        description: "Box deployment contract test.",
        model: { id: "anthropic/claude-sonnet-4.6", route: "gateway" },
        sandbox: "box-standard",
        social: [],
        sprite: "test-sprite",
        version: 1,
        zaps: ["test-zap"],
      },
    });

    expect(variables).toContainEqual({
      key: "BOX_API_KEY",
      target: ["production", "preview"],
      type: "sensitive",
      value: "box_test_key",
    });
    expect(variables).toContainEqual(expect.objectContaining({
      key: "ZAP_SANDBOX_BACKEND",
      value: "box",
    }));
  });
});
