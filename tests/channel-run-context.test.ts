import { describe, expect, it } from "vitest";
import {
  assertPaidToolSession,
  resolveChannelAwareRunContext,
  resolvePinnedSessionAuth,
} from "../lib/channel-run-context";

const linked = {
  attributes: { channelIsDirectMessage: "true", walletUserId: "supabase-user-1" },
  authenticator: "channel-link",
  principalId: "wallet:0x1111111111111111111111111111111111111111",
};

describe("channel-aware run context", () => {
  it("keeps unlinked channel turns plan-only", () => {
    const auth = { attributes: {}, authenticator: "channel-unlinked", principalId: "channel-key" };
    expect(resolveChannelAwareRunContext({ auth, live: false })).toEqual({ credentialMode: "byok" });
    expect(() => resolveChannelAwareRunContext({ auth, live: true })).toThrow(/linked wallet/i);
  });

  it("defaults a linked live channel run to WZRD Cloud with its verified wallet identity", () => {
    expect(resolveChannelAwareRunContext({ auth: linked, live: true })).toEqual({
      credentialMode: "wzrd-cloud",
      principalId: linked.principalId,
      userId: "supabase-user-1",
    });
  });

  it("preserves anonymous and self-hosted BYOK behavior", () => {
    expect(resolveChannelAwareRunContext({ live: true })).toEqual({ credentialMode: "byok" });
  });

  it("rejects live spend from shared channel threads even when the wallet is linked", () => {
    expect(() => resolveChannelAwareRunContext({
      auth: { ...linked, attributes: { ...linked.attributes, channelIsDirectMessage: "false" } },
      live: true,
    })).toThrow(/direct message/i);
  });

  it("pins paid effects to the session initiator and rejects a different approver", () => {
    const otherWallet = {
      ...linked,
      principalId: "wallet:0x2222222222222222222222222222222222222222",
    };
    expect(() => resolvePinnedSessionAuth({ current: otherWallet, initiator: linked })).toThrow(/initiating channel identity/i);
    expect(() => assertPaidToolSession({
      current: otherWallet,
      initiator: linked,
    })).toThrow(/initiating channel identity/i);
  });

  it("blocks primitive paid effects for an unlinked channel principal", () => {
    const unlinked = {
      attributes: { channelIsDirectMessage: "true" },
      authenticator: "channel-unlinked",
      principalId: "channel-key",
    };
    expect(() => assertPaidToolSession({ current: unlinked, initiator: unlinked })).toThrow(/linked wallet/i);
  });
});
