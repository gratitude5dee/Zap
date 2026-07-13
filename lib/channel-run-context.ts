import type { ZapCredentialMode } from "./zap-run-auth";

type SessionPrincipal = {
  attributes: Readonly<Record<string, string | readonly string[]>>;
  authenticator: string;
  principalId: string;
};

export type SessionAuthPair = {
  current?: SessionPrincipal | null;
  initiator?: SessionPrincipal | null;
};

export type ChannelAwareRunContext = {
  credentialMode: ZapCredentialMode;
  principalId?: string;
  userId?: string;
};

export function resolveChannelAwareRunContext(input: {
  auth?: SessionPrincipal | null;
  credentialMode?: ZapCredentialMode;
  live: boolean;
}): ChannelAwareRunContext {
  const auth = input.auth;
  const channelAuth = auth?.authenticator === "channel-link" || auth?.authenticator === "channel-unlinked";
  if (channelAuth && input.live && auth?.authenticator !== "channel-link") {
    throw new Error("Live runs from chat require a linked wallet. Generate a link code in Zap Settings, then send /link CODE here.");
  }
  if (channelAuth && input.live && auth?.attributes.channelIsDirectMessage !== "true") {
    throw new Error("Live runs from chat are only allowed in a direct message with Zap.");
  }

  const credentialMode = input.credentialMode
    ?? (auth?.authenticator === "channel-link" && input.live ? "wzrd-cloud" : "byok");
  const walletPrincipal = auth?.principalId.startsWith("wallet:0x") ? auth.principalId : undefined;
  if (credentialMode === "wzrd-cloud" && input.live && !walletPrincipal) {
    throw new Error("WZRD Cloud runs require a verified wallet principal.");
  }

  const walletUserId = stringAttribute(auth?.attributes.walletUserId);
  return {
    credentialMode,
    principalId: walletPrincipal,
    userId: walletUserId,
  };
}

export function resolvePinnedSessionAuth(auth: SessionAuthPair): SessionPrincipal | undefined {
  const initiator = auth.initiator ?? auth.current ?? undefined;
  if (!initiator) return undefined;
  if (isChannelPrincipal(initiator) && auth.current && !sameChannelPrincipal(initiator, auth.current)) {
    throw new Error("Only the initiating channel identity can approve or execute this paid action.");
  }
  return initiator;
}

export function assertPaidToolSession(auth: SessionAuthPair) {
  const principal = resolvePinnedSessionAuth(auth);
  if (principal?.authenticator === "channel-unlinked") {
    throw new Error("Paid media tools from chat require a linked wallet. Generate a link code in Zap Settings, then send /link CODE in a direct message.");
  }
  if (principal?.authenticator === "channel-link" && principal.attributes.channelIsDirectMessage !== "true") {
    throw new Error("Paid media tools from chat are only allowed in a direct message with Zap.");
  }
  return principal;
}

function isChannelPrincipal(principal: SessionPrincipal) {
  return principal.authenticator === "channel-link" || principal.authenticator === "channel-unlinked";
}

function sameChannelPrincipal(left: SessionPrincipal, right: SessionPrincipal) {
  if (!isChannelPrincipal(right)) return false;
  const leftKey = stringAttribute(left.attributes.channelPrincipalKey) ?? left.principalId;
  const rightKey = stringAttribute(right.attributes.channelPrincipalKey) ?? right.principalId;
  return leftKey === rightKey;
}

function stringAttribute(value: string | readonly string[] | undefined) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
