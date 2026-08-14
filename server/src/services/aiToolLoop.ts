export const MAX_CHAT_TOOL_ROUNDS = 3;

export function shouldAllowToolsOnFollowUpRound(round: number): boolean {
  // Round 1 = first follow-up after the initial completion's tools.
  // Allow tools through round (MAX-1); the final round answers only.
  return Number.isFinite(round) && round >= 1 && round < MAX_CHAT_TOOL_ROUNDS;
}

export function shouldRunAnotherToolRound(params: {
  round: number;
  hasClientAction: boolean;
  newToolCalls: Array<{ name?: string }>;
}): boolean {
  if (params.hasClientAction) return false;
  if (!shouldAllowToolsOnFollowUpRound(params.round)) return false;
  return Array.isArray(params.newToolCalls) && params.newToolCalls.some((tool) => Boolean(tool?.name));
}
