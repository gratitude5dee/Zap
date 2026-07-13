import { describe, expect, it, vi } from "vitest";

const submitGeneration = vi.fn();
vi.mock("../lib/providers/router.js", () => ({ submitGeneration }));

const unlinked = {
  attributes: { channelIsDirectMessage: "true" },
  authenticator: "channel-unlinked",
  principalId: "channel:telegram:zap:123",
  principalType: "channel",
};

describe("primitive paid media tools", () => {
  it.each([
    ["generate_image", () => import("../agent/tools/generate_image")],
    ["generate_video", () => import("../agent/tools/generate_video")],
    ["generate_audio", () => import("../agent/tools/generate_audio")],
    ["edit_video", () => import("../agent/tools/edit_video")],
    ["upscale_frame", () => import("../agent/tools/upscale_frame")],
  ])("requires approval and rejects unlinked chat before provider submission: %s", async (_name, load) => {
    const tool = (await load()).default;
    expect(tool.approval?.({ toolInput: {} } as never)).toBe("user-approval");
    await expect(tool.execute({} as never, {
      session: { auth: { current: unlinked, initiator: unlinked } },
    } as never)).rejects.toThrow(/linked wallet/i);
    expect(submitGeneration).not.toHaveBeenCalled();
  });
});
