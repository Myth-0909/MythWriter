import type { ApiChatHistoryMessage, ToolCallEvent } from "./aiChatApiMessages";

export const DEFAULT_CHAT_HISTORY_MAX_CHARS = 14000;
const TOOL_CONTENT_CAP = 360;

export type TruncateChatHistoryOptions = {
  maxChars?: number;
  toolContentCap?: number;
};

function compactToolCall(toolCall: ToolCallEvent, toolContentCap: number): ToolCallEvent {
  const summary = String(toolCall.summary || "").trim();
  const result = String(toolCall.result || "").trim();
  const content = String(toolCall.content || "").trim();
  const preferred = [summary, result].filter(Boolean).join("\n") || content;
  const clipped =
    preferred.length > toolContentCap
      ? `${preferred.slice(0, toolContentCap)}…`
      : preferred;
  return {
    ...toolCall,
    content: clipped || undefined,
    summary: summary || undefined,
    result: result || undefined,
  };
}

export function estimateMessageChars(messages: ApiChatHistoryMessage[]): number {
  return messages.reduce((total, message) => {
    let size = String(message.content || "").length;
    if (message.finalContent) size += String(message.finalContent).length;
    if (message.tool_call_id) size += message.tool_call_id.length;
    for (const toolCall of message.toolCalls || []) {
      size += String(toolCall.name || "").length;
      size += String(toolCall.arguments || "").length;
      size += String(toolCall.content || "").length;
      size += String(toolCall.summary || "").length;
      size += String(toolCall.result || "").length;
    }
    return total + size;
  }, 0);
}

export function truncateChatHistory<T extends ApiChatHistoryMessage>(
  messages: T[],
  options: TruncateChatHistoryOptions = {}
): T[] {
  const maxChars = options.maxChars ?? DEFAULT_CHAT_HISTORY_MAX_CHARS;
  const toolContentCap = options.toolContentCap ?? TOOL_CONTENT_CAP;
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const compacted = messages.map((message) => {
    if (message.role === "tool") {
      const content = String(message.content || "").trim();
      const clipped =
        content.length > toolContentCap ? `${content.slice(0, toolContentCap)}…` : content;
      return { ...message, content: clipped };
    }
    if (!message.toolCalls?.length) return message;
    return {
      ...message,
      toolCalls: message.toolCalls.map((toolCall) => compactToolCall(toolCall, toolContentCap)),
    };
  });

  if (estimateMessageChars(compacted) <= maxChars) {
    return compacted;
  }

  // Keep the newest contiguous suffix that fits the budget.
  let start = compacted.length - 1;
  while (start > 0) {
    const candidate = compacted.slice(start);
    if (estimateMessageChars(candidate) > maxChars) {
      start += 1;
      break;
    }
    start -= 1;
  }
  if (start < 0) start = 0;

  let trimmed = compacted.slice(start);
  // Avoid starting mid-tool pair: drop leading tool messages.
  while (trimmed.length > 0 && trimmed[0].role === "tool") {
    trimmed = trimmed.slice(1);
  }

  // If still oversized (single giant message), hard-clip contents from the oldest kept message.
  while (trimmed.length > 1 && estimateMessageChars(trimmed) > maxChars) {
    trimmed = trimmed.slice(1);
    while (trimmed.length > 0 && trimmed[0].role === "tool") {
      trimmed = trimmed.slice(1);
    }
  }

  if (trimmed.length === 1 && estimateMessageChars(trimmed) > maxChars) {
    const only = trimmed[0];
    const content = String(only.content || "");
    return [
      {
        ...only,
        content: content.length > maxChars ? `${content.slice(0, maxChars)}…` : content,
        toolCalls: only.toolCalls?.map((toolCall) => compactToolCall(toolCall, Math.min(120, toolContentCap))),
      },
    ];
  }

  return trimmed;
}

/** Build a compact long-term memory blurb from messages dropped by truncation. */
export function summarizeDroppedChatHistory(
  original: ApiChatHistoryMessage[],
  kept: ApiChatHistoryMessage[],
  maxChars = 1200
): string {
  if (!Array.isArray(original) || original.length === 0) return "";
  if (!Array.isArray(kept) || kept.length >= original.length) return "";

  // Approximate dropped prefix: everything before the first kept message by content+role match.
  const firstKept = kept[0];
  let dropEnd = 0;
  for (let i = 0; i < original.length; i += 1) {
    const msg = original[i];
    if (
      msg.role === firstKept.role
      && String(msg.content || "") === String(firstKept.content || "")
    ) {
      dropEnd = i;
      break;
    }
    dropEnd = i + 1;
  }
  const dropped = original.slice(0, dropEnd).filter((msg) => msg.role === "user" || msg.role === "assistant");
  if (dropped.length === 0) return "";

  const lines: string[] = [];
  for (const msg of dropped.slice(-8)) {
    const role = msg.role === "user" ? "User" : "Assistant";
    const body = String(msg.content || msg.finalContent || "").replace(/\s+/g, " ").trim();
    if (!body) continue;
    lines.push(`${role}: ${body.length > 160 ? `${body.slice(0, 160)}…` : body}`);
  }
  const joined = lines.join("\n");
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
}
