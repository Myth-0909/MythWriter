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
