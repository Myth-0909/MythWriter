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
