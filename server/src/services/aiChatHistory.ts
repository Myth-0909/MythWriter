export const DEFAULT_CHAT_HISTORY_MAX_CHARS = 14000;
const TOOL_CONTENT_CAP = 360;
const MESSAGE_CONTENT_CAP = 12000;
const TOOL_ARGUMENTS_CAP = 4000;

export type ChatHistoryMessage = {
  role: string;
  content?: string;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

function estimateChars(messages: ChatHistoryMessage[]): number {
  return messages.reduce((total, message) => {
    let size = String(message.content || "").length;
    if (message.tool_call_id) size += message.tool_call_id.length;
    for (const toolCall of message.tool_calls || []) {
      size += String(toolCall.id || "").length;
      size += String(toolCall.function?.name || "").length;
      size += String(toolCall.function?.arguments || "").length;
    }
    return total + size;
  }, 0);
}

function clipContent(content: string, cap: number): string {
  const text = String(content || "");
  return text.length > cap ? `${text.slice(0, cap)}…` : text;
}

export function truncateApiChatMessages<T extends ChatHistoryMessage>(
  messages: T[],
  maxChars = DEFAULT_CHAT_HISTORY_MAX_CHARS
): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const compacted = messages.map((message) => {
    const contentCap = message.role === "tool" ? TOOL_CONTENT_CAP : MESSAGE_CONTENT_CAP;
    return {
      ...message,
      content: clipContent(String(message.content || ""), contentCap),
      tool_calls: message.tool_calls?.map((toolCall) => ({
        ...toolCall,
        function: toolCall.function
          ? {
              ...toolCall.function,
              arguments: clipContent(String(toolCall.function.arguments || ""), TOOL_ARGUMENTS_CAP),
            }
          : toolCall.function,
      })),
    };
  });

  if (estimateChars(compacted) <= maxChars) return compacted;

  let start = compacted.length - 1;
  while (start > 0) {
    const candidate = compacted.slice(start);
    if (estimateChars(candidate) > maxChars) {
      start += 1;
      break;
    }
    start -= 1;
  }
  if (start < 0) start = 0;

  let trimmed = compacted.slice(start);
  while (trimmed.length > 0 && trimmed[0].role === "tool") {
    trimmed = trimmed.slice(1);
  }
  while (trimmed.length > 1 && estimateChars(trimmed) > maxChars) {
    trimmed = trimmed.slice(1);
    while (trimmed.length > 0 && trimmed[0].role === "tool") {
      trimmed = trimmed.slice(1);
    }
  }
  return trimmed;
}
