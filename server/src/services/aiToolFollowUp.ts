import { createLinkedTimeoutSignal } from "../lib/abortSignal";
import { buildDateTimeContext, resolveAssistantActionReply } from "./aiService";
import {
  buildToolFallbackReply,
  buildToolFollowUpMessages,
  extractDsmlToolCalls,
  shouldUseToolFallbackReply,
  type AssistantToolCall,
  type AssistantToolResult,
} from "./aiToolConversation";
import { isClientActionTool, parseClientActionFromToolCalls } from "./aiClientActions";
import {
  MAX_CHAT_TOOL_ROUNDS,
  shouldAllowToolsOnFollowUpRound,
  shouldRunAnotherToolRound,
} from "./aiToolLoop";

export type ToolFollowUpExecutionEvent = {
  index: number;
  id?: string;
  name: string;
  arguments?: string;
  status: string;
  result?: string;
  summary?: string;
  content?: string;
};

export function extractToolCallsFromAssistantMessage(message: {
  content?: unknown;
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: unknown };
    name?: string;
    arguments?: unknown;
  }>;
}): AssistantToolCall[] {
  const calls: AssistantToolCall[] = [];
  const native = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  for (const tc of native) {
    const name = tc?.function?.name || tc?.name;
    if (!name) continue;
    const rawArgs = tc?.function?.arguments ?? tc?.arguments ?? "{}";
    calls.push({
      id: tc.id || "",
      name,
      arguments: typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {}),
    });
  }

  const content = String(message?.content || "");
  if (content) {
    const dsml = extractDsmlToolCalls(content);
    for (const toolCall of dsml.toolCalls) {
      calls.push(toolCall);
    }
  }
  return calls;
}

export function assistantTextFromMessage(message: { content?: unknown }): string {
  const content = String(message?.content || "");
  if (!content.trim()) return "";
  const dsml = extractDsmlToolCalls(content);
  return String(dsml.cleanContent || content).trim();
}

async function streamFollowUpContent(params: {
  response: Response;
  emitDelta: (delta: string) => void;
}): Promise<{ content: string; streamed: boolean }> {
  let followUpContent = "";
  let liveBuffer = "";
  let streamed = false;
  const contentType = params.response.headers.get("content-type") || "";
  const flushLive = () => {
    if (liveBuffer && !liveBuffer.includes("<<ACTION") && !/<<?A?C?T?I?O?N?$/.test(liveBuffer.slice(-14))) {
      params.emitDelta(liveBuffer);
      streamed = true;
      liveBuffer = "";
    }
  };

  if (contentType.includes("application/json")) {
    const json = (await params.response.json()) as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
    };
    followUpContent = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || "";
    return { content: followUpContent, streamed: false };
  }

  const reader = params.response.body?.getReader();
  if (!reader) return { content: followUpContent, streamed };

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta =
          parsed.choices?.[0]?.delta?.content
          ?? parsed.choices?.[0]?.message?.content
          ?? parsed.choices?.[0]?.text
          ?? "";
        if (delta) {
          followUpContent += delta;
          liveBuffer += delta;
        }
      } catch {
        // Ignore malformed SSE fragments.
      }
    }
    flushLive();
  }
  if (liveBuffer && !liveBuffer.includes("<<ACTION")) {
    params.emitDelta(liveBuffer);
    streamed = true;
    liveBuffer = "";
  }
  return { content: followUpContent, streamed };
}

export async function runBoundedToolFollowUp(params: {
  apiUrl: string;
  apiKey: string;
  aiModel: string;
  userLang: string;
  lastUserContent: string;
  chatTools: unknown[];
  parentSignal: AbortSignal;
  initialToolCalls: AssistantToolCall[];
  initialExecutableResults: AssistantToolResult[];
  initialAction?: unknown;
  nextToolIndex: number;
  executeToolCalls: (toolCalls: AssistantToolCall[]) => Promise<{
    toolResults: AssistantToolResult[];
    toolCallResults: ToolFollowUpExecutionEvent[];
  }>;
  emitDelta: (delta: string) => void;
  emitToolCalling: (index: number, toolCall: AssistantToolCall) => void;
}): Promise<{
  followUpReply: string;
  finalAction: unknown;
  additionalToolCalls: AssistantToolCall[];
  additionalToolResults: AssistantToolResult[];
  additionalToolCallResults: ToolFollowUpExecutionEvent[];
}> {
  let followUpReply = "";
  let finalAction: unknown = params.initialAction ?? null;
  const additionalToolCalls: AssistantToolCall[] = [];
  const additionalToolResults: AssistantToolResult[] = [];
  const additionalToolCallResults: ToolFollowUpExecutionEvent[] = [];

  const executableCalls = params.initialToolCalls.filter((tc) => tc && !isClientActionTool(tc.name));
  let messageTail = buildToolFollowUpMessages(executableCalls, params.initialExecutableResults);
  if (!messageTail.some((message) => message.role === "tool")) {
    console.warn("[AI] Follow-up payload had no matched tool results; using tool-result fallback");
    return {
      followUpReply: "",
      finalAction,
      additionalToolCalls,
      additionalToolResults,
      additionalToolCallResults,
    };
  }

  let nextIndex = params.nextToolIndex;
  let allExecutableResults = [...params.initialExecutableResults];

  for (let round = 1; round <= MAX_CHAT_TOOL_ROUNDS; round++) {
    const allowTools = shouldAllowToolsOnFollowUpRound(round) && params.chatTools.length > 0;
    const followUpSignal = createLinkedTimeoutSignal(params.parentSignal, 60000);
    try {
      const followUpSystemPrompt = allowTools
        ? `${buildDateTimeContext()}\nYou are XiaoAn. Some tools have already been executed. If you still need more workspace facts, call tools. Prefer answering when you have enough. Document/spreadsheet mutation tools are allowed when the user asked to edit.`
        : `${buildDateTimeContext()}\nYou are XiaoAn. Tools have already been executed. Answer the user's request directly with concrete numbers or outcomes from the tool results. Do not call tools again. Do not say "please check the results".`;

      const body: Record<string, unknown> = {
        model: params.aiModel,
        messages: [
          { role: "system", content: followUpSystemPrompt },
          ...(params.lastUserContent
            ? [{ role: "user", content: params.lastUserContent }]
            : []),
          ...messageTail,
        ],
        temperature: 0.7,
        max_tokens: allowTools ? 1200 : 800,
        stream: !allowTools,
      };
      if (allowTools) {
        body.tools = params.chatTools;
        body.tool_choice = "auto";
      }

      const followUpRes = await fetch(params.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: followUpSignal.signal,
      });

      if (!followUpRes.ok) {
        console.error("[AI] Follow-up call failed:", followUpRes.status);
        const errText = await followUpRes.text().catch(() => "");
        console.error("[AI] Follow-up error body:", errText.slice(0, 300));
        break;
      }

      if (allowTools) {
        const json = (await followUpRes.json()) as {
          choices?: Array<{ message?: { content?: string; tool_calls?: unknown[] } }>;
        };
        const message = json.choices?.[0]?.message || {};
        const nextCalls = extractToolCallsFromAssistantMessage(message as {
          content?: unknown;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: unknown };
            name?: string;
            arguments?: unknown;
          }>;
        });
        const proposed = parseClientActionFromToolCalls(nextCalls, params.userLang);
        if (proposed.action) {
          finalAction = proposed.action;
          followUpReply = proposed.reply;
          params.emitDelta(followUpReply);
          break;
        }

        if (!shouldRunAnotherToolRound({
          round,
          hasClientAction: false,
          newToolCalls: nextCalls,
        })) {
          const text = assistantTextFromMessage(message);
          if (shouldUseToolFallbackReply(text, allExecutableResults)) {
            followUpReply = "";
          } else {
            const parsed = resolveAssistantActionReply(text);
            followUpReply = parsed.reply;
            if (!finalAction) finalAction = parsed.action;
            if (followUpReply && !parsed.action) {
              params.emitDelta(followUpReply);
            }
          }
          break;
        }

        const serverCalls = nextCalls.filter((tc) => tc && !isClientActionTool(tc.name));
        for (const toolCall of serverCalls) {
          params.emitToolCalling(nextIndex, toolCall);
          nextIndex += 1;
          additionalToolCalls.push(toolCall);
        }

        const executed = await params.executeToolCalls(serverCalls);
        additionalToolResults.push(...executed.toolResults);
        additionalToolCallResults.push(...executed.toolCallResults);
        const execOnly = executed.toolResults.filter((result) => !isClientActionTool(result.name));
        allExecutableResults = [...allExecutableResults, ...execOnly];
        messageTail = [
          ...messageTail,
          ...buildToolFollowUpMessages(serverCalls, execOnly),
        ];
        continue;
      }

      // Final answer round — stream tokens to the client.
      const streamed = await streamFollowUpContent({
        response: followUpRes,
        emitDelta: params.emitDelta,
      });
      if (shouldUseToolFallbackReply(streamed.content, allExecutableResults)) {
        console.warn("[AI] Follow-up reply was a tool placeholder; using tool-result fallback");
        followUpReply = "";
      } else {
        const parsedFollowUp = resolveAssistantActionReply(streamed.content);
        followUpReply = parsedFollowUp.reply;
        if (!finalAction) finalAction = parsedFollowUp.action;
        if (!streamed.streamed && followUpReply && !parsedFollowUp.action) {
          params.emitDelta(followUpReply);
        }
      }
      console.log("[AI] Follow-up reply length:", followUpReply.length);
      break;
    } catch (err) {
      console.error("[AI] Follow-up call error:", err);
      break;
    } finally {
      followUpSignal.cleanup();
    }
  }

  if (!followUpReply && allExecutableResults.length > 0 && !finalAction) {
    followUpReply = buildToolFallbackReply(allExecutableResults, params.userLang);
    params.emitDelta(followUpReply);
  }

  return {
    followUpReply,
    finalAction,
    additionalToolCalls,
    additionalToolResults,
    additionalToolCallResults,
  };
}
