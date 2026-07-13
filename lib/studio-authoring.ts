export const STUDIO_ZAP_DRAFT_EVENT = "zap:studio:draft";

export type StudioZapDraft = {
  markdown: string;
  slug: string;
  toolCallId: string;
};

type MessageLike = {
  parts?: readonly unknown[];
};

export function extractLatestSavedZapDraft(messages: readonly MessageLike[]): StudioZapDraft | undefined {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const parts = messages[messageIndex]?.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (!isRecord(part)
        || part.type !== "dynamic-tool"
        || part.toolName !== "save_zap"
        || part.state !== "output-available") {
        continue;
      }
      const output = readOutput(part.output);
      const markdown = readString(output?.markdown);
      const slug = readString(output?.slug);
      const toolCallId = readString(part.toolCallId);
      if (markdown && slug && toolCallId && /^[a-z0-9-]+$/.test(slug)) {
        return { markdown, slug, toolCallId };
      }
    }
  }
  return undefined;
}

export function isStudioZapDraft(value: unknown): value is StudioZapDraft {
  if (!isRecord(value)) return false;
  const markdown = readString(value.markdown);
  const slug = readString(value.slug);
  return Boolean(
    markdown
    && slug
    && /^[a-z0-9-]+$/.test(slug)
    && readString(value.toolCallId),
  );
}

function readOutput(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
