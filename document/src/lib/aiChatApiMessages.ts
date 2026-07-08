import { buildToolMemoryContent } from "./aiActionState";
import {
  filterApiHistoryToolCalls,
  normalizeChatToolCallId,
  resolveStoredAssistantContent,
  shouldIncludeAssistantInPrompt,
} from "./aiChatStream";

export type ToolCallEvent = {
  index: number;
  id?: string;
  name: string;
  arguments?: string;
  status: string;
  result?: string;
  summary?: string;
  content?: string;
};

export type ApiChatHistoryMessage = {
  role: string;
  content: string;
  finalContent?: string;
  interrupted?: boolean;
  toolCalls?: ToolCallEvent[];
  tool_call_id?: string;
};

type ApiToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ApiChatMessage = {
  role: string;
  content: string;
  tool_calls?: ApiToolCall[];
  tool_call_id?: string;
  name?: string;
};

// OpenAI-compatible chat history is strict: a tool message is only valid when it
// immediately answers a tool_call from the preceding assistant message.
export function toApiMessages(messages: ApiChatHistoryMessage[]): ApiChatMessage[] {
  const result: ApiChatMessage[] = [];

  for (const message of messages) {
    if (message.role === "tool") {
      continue;
    }

    if (
      message.role === "assistant" &&
      !shouldIncludeAssistantInPrompt({
        content: message.content,
        finalContent: message.finalContent,
        interrupted: message.interrupted,
      })
    ) {
      continue;
    }

    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      const assistantContent = resolveStoredAssistantContent({
        displayContent: message.content,
        finalContent: message.finalContent,
      });
      const apiToolCalls = filterApiHistoryToolCalls(message.toolCalls);

      if (apiToolCalls.length === 0) {
        result.push({ role: "assistant", content: assistantContent || "" });
        continue;
      }

      result.push({
        role: "assistant",
        content: assistantContent || "",
        tool_calls: apiToolCalls.map((toolCall, index) => ({
          id: normalizeChatToolCallId(toolCall, index),
          type: "function",
          function: { name: toolCall.name, arguments: toolCall.arguments || "{}" },
        })),
      });

      for (const toolCall of apiToolCalls) {
        const toolContent = buildToolMemoryContent(toolCall);
        const toolCallId = normalizeChatToolCallId(toolCall, toolCall.index);
        result.push({ role: "tool", tool_call_id: toolCallId, content: toolContent });
      }
      continue;
    }

    result.push({
      role: message.role,
      content: resolveStoredAssistantContent({
        displayContent: message.content,
        finalContent: message.finalContent,
      }),
    });
  }

  return result;
}
