import { describe, expect, it } from "vitest";
import {
  formatImessageInputRequests,
  MemoryImessageInputStore,
  parseImessageInputResponse,
} from "../lib/imessage-hitl";

const approval = {
  allowFreeform: false,
  display: "confirmation" as const,
  options: [
    { id: "approve", label: "Approve" },
    { id: "deny", label: "Deny" },
  ],
  prompt: "Approve a live run quoted at $0.25?",
  requestId: "request-1",
};

describe("iMessage human-in-the-loop bridge", () => {
  it("renders a text confirmation and maps the next signed reply to Eve input", () => {
    expect(formatImessageInputRequests([approval])).toContain("Approve a live run quoted at $0.25?");
    expect(formatImessageInputRequests([approval])).toContain("Reply approve or deny");
    expect(parseImessageInputResponse("approve", approval)).toEqual({
      optionId: "approve",
      requestId: "request-1",
    });
    expect(parseImessageInputResponse("no", approval)).toEqual({
      optionId: "deny",
      requestId: "request-1",
    });
  });

  it("stores one pending request durably by conversation and consumes it once", async () => {
    let now = 1_000;
    const store = new MemoryImessageInputStore(() => now);
    await store.save("tenant:conversation", [approval], 2_000);
    await expect(store.consume("tenant:conversation")).resolves.toEqual([approval]);
    await expect(store.consume("tenant:conversation")).resolves.toBeNull();
    await store.save("tenant:expired", [approval], 1_100);
    now = 1_101;
    await expect(store.consume("tenant:expired")).resolves.toBeNull();
  });
});
