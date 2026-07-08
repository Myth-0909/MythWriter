export const AI_CHAT_TYPEWRITER_INTERVAL_MS = 18;

export function getTypewriterChunkSize(remainingCharacters: number): number {
  if (remainingCharacters > 1200) return 14;
  if (remainingCharacters > 640) return 9;
  if (remainingCharacters > 260) return 5;
  if (remainingCharacters > 80) return 3;
  return 2;
}

export function normalizeChatToolCallId(toolCall: { id?: string; index?: number }, fallbackIndex: number): string {
  const id = String(toolCall.id || "").trim();
  if (id) return id;
  const index = Number.isInteger(toolCall.index) ? toolCall.index : fallbackIndex;
  return `call_${index}`;
}

type ApiHistoryToolCall = {
  status?: string;
  content?: string;
  result?: string;
  summary?: string;
};

export function filterApiHistoryToolCalls<T extends ApiHistoryToolCall>(toolCalls: T[]): T[] {
  return toolCalls.filter((toolCall) => {
    if (toolCall.status !== "done") return false;
    return [toolCall.content, toolCall.summary, toolCall.result]
      .some((value) => String(value || "").trim().length > 0);
  });
}

export function resolveStoredAssistantContent({
  displayContent,
  finalContent,
}: {
  displayContent: string;
  finalContent?: string;
}): string {
  const final = String(finalContent || "").trim();
  return final ? finalContent || "" : displayContent;
}

export function resolveAssistantActionContent({
  content,
  finalContent,
}: {
  content: string;
  finalContent?: string;
}): string {
  return resolveStoredAssistantContent({ displayContent: content, finalContent });
}

export function canSendAssistantFeedback({
  content,
  finalContent,
  isTyping,
  interrupted,
}: {
  content: string;
  finalContent?: string;
  isTyping?: boolean;
  interrupted?: boolean;
}): boolean {
  if (isTyping || interrupted) return false;
  return resolveAssistantActionContent({ content, finalContent }).trim().length > 0;
}

export function shouldIncludeAssistantInPrompt({
  content,
  finalContent,
  interrupted,
}: {
  content: string;
  finalContent?: string;
  interrupted?: boolean;
}): boolean {
  if (interrupted) return false;
  return resolveAssistantActionContent({ content, finalContent }).trim().length > 0;
}

export function resolveChatFinalContent({
  streamedContent,
  finalReply,
  hasToolCalls,
}: {
  streamedContent: string;
  finalReply: string;
  hasToolCalls: boolean;
}): string {
  const final = finalReply.trim();
  if (hasToolCalls && final) return finalReply;
  return streamedContent || finalReply;
}
