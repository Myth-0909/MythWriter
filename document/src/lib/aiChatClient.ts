import { API_BASE } from "@/lib/apiBase";
import { toApiMessages, type ToolCallEvent } from "@/lib/aiChatApiMessages";
import { truncateChatHistory, summarizeDroppedChatHistory } from "@/lib/aiChatHistory";
import type { AssistantAction } from "@/lib/aiActionState";

export type StreamChatReference = {
  type: "document" | "brain" | "spreadsheet";
  id: string;
  title?: string;
  selectedText?: string;
  auto?: boolean;
  score?: number;
};

export type StreamChatMessage = {
  role: string;
  content: string;
  finalContent?: string;
  interrupted?: boolean;
  toolCalls?: ToolCallEvent[];
  tool_call_id?: string;
};

export type StreamChatResult = {
  reply: string;
  action: AssistantAction;
  thinking?: string;
  toolCalls?: ToolCallEvent[];
};

export async function streamChat(
  data: {
    messages: StreamChatMessage[];
    personality: string;
    memoryContext: string;
    purpose?: "chat" | "selection_edit";
    references?: StreamChatReference[];
  },
  onDelta: (delta: string) => void,
  onThinking: (delta: string) => void,
  onToolCall: (tc: ToolCallEvent) => void,
  signal: AbortSignal
): Promise<StreamChatResult> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const boundedMessages = truncateChatHistory(data.messages);
  const droppedMemory = summarizeDroppedChatHistory(data.messages, boundedMessages);
  const memoryContext = [String(data.memoryContext || "").trim(), droppedMemory]
    .filter(Boolean)
    .join("\n\n");

  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...data,
      memoryContext,
      messages: toApiMessages(boundedMessages),
    }),
    signal,
  });

  const ct = res.headers.get("content-type") || "";

  if (!res.ok) {
    if (ct.includes("application/json")) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}`);
  }

  if (ct.includes("application/json")) {
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return { reply: json.reply || "", action: (json.action || null) as AssistantAction };
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let fullContent = "";
  let finalReply = "";
  let finalAction: AssistantAction = null;
  let thinking = "";
  let receivedDone = false;
  const toolCalls: ToolCallEvent[] = [];

  function dispatchEvent(event: string, data: Record<string, unknown>) {
    if (event === "delta" && data.delta) {
      fullContent += String(data.delta);
      onDelta(String(data.delta));
    } else if (event === "thinking" && data.delta) {
      thinking += String(data.delta);
      onThinking(String(data.delta));
    } else if (event === "tool_call" && data.name) {
      const tc = data as unknown as ToolCallEvent;
      const existing = toolCalls.findIndex((item) => item.index === tc.index);
      if (existing >= 0) {
        toolCalls[existing] = tc;
      } else {
        toolCalls.push(tc);
      }
      onToolCall(tc);
    } else if (event === "done") {
      receivedDone = true;
      finalReply = String(data.reply || "");
      finalAction = (data.action || null) as AssistantAction;
      if (data.thinking) thinking = String(data.thinking);
      if (Array.isArray(data.toolCalls)) {
        toolCalls.splice(0, toolCalls.length, ...(data.toolCalls as ToolCallEvent[]));
      }
    } else if (event === "delta" || event === "message") {
      if (data.delta) {
        fullContent += String(data.delta);
        onDelta(String(data.delta));
      }
      if (data.done) {
        receivedDone = true;
        finalReply = String(data.reply || "");
        finalAction = (data.action || null) as AssistantAction;
      }
    } else if (event === "error") {
      throw new Error(String(data.error || "AI request failed"));
    }
  }

  function processLine(line: string) {
    if (!line || line.startsWith(":")) return;
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
      return;
    }
    if (!line.startsWith("data:")) return;
    const dataStr = line.slice(5).trimStart();
    if (currentEvent) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        // Skip malformed JSON frames.
        currentEvent = "";
        return;
      }
      dispatchEvent(currentEvent, parsed);
      currentEvent = "";
      return;
    }
    try {
      const parsed = JSON.parse(dataStr);
      if (parsed.error) throw new Error(parsed.error);
      dispatchEvent("message", parsed);
    } catch (error: unknown) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) processLine(line.replace(/\r$/, ""));
  }

  buffer += decoder.decode();
  if (buffer.trim()) processLine(buffer.replace(/\r$/, ""));

  if (!receivedDone && !signal.aborted) throw new Error("CHAT_STREAM_INCOMPLETE");
  if (!finalReply && fullContent) finalReply = fullContent;
  return {
    reply: finalReply,
    action: finalAction,
    thinking: thinking || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}
