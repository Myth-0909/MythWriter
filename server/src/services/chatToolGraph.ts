import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createLinkedTimeoutSignal } from "../lib/abortSignal";
import { buildDateTimeContext, resolveAssistantActionReply } from "./aiService";
import {
  buildToolFallbackReply,
  buildToolFollowUpMessages,
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
import {
  assistantTextFromMessage,
  extractToolCallsFromAssistantMessage,
  type ToolFollowUpExecutionEvent,
} from "./aiToolFollowUp";

/** Graph-local policy: search when needed, then propose documents — never dump long articles only in chat. */
export const CHAT_TOOL_GRAPH_POLICY = `You are XiaoAn running a multi-step tool workflow.
When the user asks to generate/write/draft a document (including news digests or briefs about external topics):
1. Call search_web first if you need current external facts.
2. Then call create_document with full Markdown content.
Do not replace create_document with a long chat-only article.
Prefer patch_document for small edits to an existing document.
Document/spreadsheet mutation tools are client proposals only — never claim they were saved until the user confirms.`;

export type ChatToolGraphModelTurn = {
  content?: string;
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: unknown };
    name?: string;
    arguments?: unknown;
  }>;
};

export type ChatToolGraphCallModel = (args: {
  round: number;
  allowTools: boolean;
  maxTokens?: number;
  systemPrompt: string;
  lastUserContent: string;
  messageTail: Array<{ role: string; content: string; tool_call_id?: string; name?: string }>;
  chatTools: unknown[];
  signal: AbortSignal;
}) => Promise<ChatToolGraphModelTurn>;

export type ChatToolGraphParams = {
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
  /** Injectable model turn for tests; defaults to OpenAI-compatible fetch. */
  callModel?: ChatToolGraphCallModel;
};

type GraphMessage = { role: string; content: string; tool_call_id?: string; name?: string };

type ChatToolGraphState = {
  round: number;
  messageTail: GraphMessage[];
  allExecutableResults: AssistantToolResult[];
  pendingServerCalls: AssistantToolCall[];
  proposedAction: unknown;
  reply: string;
  nextIndex: number;
  additionalToolCalls: AssistantToolCall[];
  additionalToolResults: AssistantToolResult[];
  additionalToolCallResults: ToolFollowUpExecutionEvent[];
  stop: boolean;
  streamedFinal: boolean;
};

const ChatToolGraphAnnotation = Annotation.Root({
  round: Annotation<number>,
  messageTail: Annotation<GraphMessage[]>,
  allExecutableResults: Annotation<AssistantToolResult[]>,
  pendingServerCalls: Annotation<AssistantToolCall[]>,
  proposedAction: Annotation<unknown>,
  reply: Annotation<string>,
  nextIndex: Annotation<number>,
  additionalToolCalls: Annotation<AssistantToolCall[]>,
  additionalToolResults: Annotation<AssistantToolResult[]>,
  additionalToolCallResults: Annotation<ToolFollowUpExecutionEvent[]>,
  stop: Annotation<boolean>,
  streamedFinal: Annotation<boolean>,
});

async function defaultCallModel(args: {
  apiUrl: string;
  apiKey: string;
  aiModel: string;
  round: number;
  allowTools: boolean;
  maxTokens?: number;
  systemPrompt: string;
  lastUserContent: string;
  messageTail: GraphMessage[];
  chatTools: unknown[];
  signal: AbortSignal;
  emitDelta: (delta: string) => void;
}): Promise<ChatToolGraphModelTurn & { streamedText?: string }> {
  const body: Record<string, unknown> = {
    model: args.aiModel,
    messages: [
      { role: "system", content: args.systemPrompt },
      ...(args.lastUserContent ? [{ role: "user", content: args.lastUserContent }] : []),
      ...args.messageTail,
    ],
    temperature: 0.7,
    max_tokens: args.maxTokens ?? (args.allowTools ? 1200 : 800),
    stream: !args.allowTools,
  };
  if (args.allowTools) {
    body.tools = args.chatTools;
    body.tool_choice = "auto";
  }

  const response = await fetch(args.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Chat tool graph model call failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  if (args.allowTools) {
    const json = (await response.json()) as {
      choices?: Array<{ message?: ChatToolGraphModelTurn }>;
    };
    return json.choices?.[0]?.message || {};
  }

  // Final answer — stream SSE deltas when possible.
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = String(json.choices?.[0]?.message?.content || "");
    return { content, streamedText: "" };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let followUpContent = "";
  let liveBuffer = "";
  const reader = response.body.getReader();
  const flushLive = () => {
    if (liveBuffer && !liveBuffer.includes("<<ACTION") && !/<<?A?C?T?I?O?N?$/.test(liveBuffer.slice(-14))) {
      args.emitDelta(liveBuffer);
      liveBuffer = "";
    }
  };
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
    args.emitDelta(liveBuffer);
    liveBuffer = "";
  }
  return { content: followUpContent, streamedText: followUpContent };
}

function requestsNewDocument(content: string): boolean {
  return /(?:写|生成|创建|新建|起草|撰写|整理|做|出).{0,80}?(?:文章|文档|报告|简报|新闻|稿件)|(?:write|draft|create|generate).{0,80}?(?:article|document|report|brief|post|news)/i
    .test(String(content || ""));
}

function hasUsableWebEvidence(results: AssistantToolResult[]): boolean {
  return results.some((result) => (
    result.name === "search_web" &&
    result.status === "done" &&
    /联网搜索结果|Web search results/i.test(String(result.content || "")) &&
    /https?:\/\//i.test(String(result.content || ""))
  ));
}

function toolDefinitionName(tool: unknown): string {
  if (!tool || typeof tool !== "object") return "";
  const definition = tool as { function?: { name?: unknown }; name?: unknown };
  return String(definition.function?.name || definition.name || "");
}

function markdownTitle(content: string, lang: string): string {
  const heading = content.match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  return heading || (lang === "en" ? "AI-generated document" : "AI 生成文章");
}

function buildSystemPrompt(allowTools: boolean, mustCreateDocument = false): string {
  if (mustCreateDocument) {
    return `${buildDateTimeContext()}\n${CHAT_TOOL_GRAPH_POLICY}\nWeb evidence is already available. Do not search again. You MUST now call create_document exactly once with the complete Markdown article. Do not return the article only as chat text.`;
  }
  const base = allowTools
    ? `${buildDateTimeContext()}\n${CHAT_TOOL_GRAPH_POLICY}\nSome tools have already been executed. If you still need facts, call tools. Prefer answering or proposing create_document/patch when you have enough.`
    : `${buildDateTimeContext()}\nYou are XiaoAn. Tools have already been executed. Answer the user's request directly with concrete outcomes from the tool results. Do not call tools again. Do not say "please check the results".`;
  return base;
}

/**
 * LangGraph-backed multi-round tool follow-up for edit intents.
 * Client mutation tools are proposals only; server never writes documents.
 */
export async function runChatToolGraph(params: ChatToolGraphParams): Promise<{
  followUpReply: string;
  finalAction: unknown;
  additionalToolCalls: AssistantToolCall[];
  additionalToolResults: AssistantToolResult[];
  additionalToolCallResults: ToolFollowUpExecutionEvent[];
}> {
  const executableCalls = params.initialToolCalls.filter((tc) => tc && !isClientActionTool(tc.name));
  const initialTail = buildToolFollowUpMessages(executableCalls, params.initialExecutableResults);
  if (!initialTail.some((message) => message.role === "tool")) {
    console.warn("[AI] LangGraph follow-up had no matched tool results; skipping graph");
    return {
      followUpReply: "",
      finalAction: params.initialAction ?? null,
      additionalToolCalls: [],
      additionalToolResults: [],
      additionalToolCallResults: [],
    };
  }

  const callModel: ChatToolGraphCallModel = params.callModel || (async (args) => {
    const signal = createLinkedTimeoutSignal(params.parentSignal, 60000);
    try {
      return await defaultCallModel({
        apiUrl: params.apiUrl,
        apiKey: params.apiKey,
        aiModel: params.aiModel,
        round: args.round,
        allowTools: args.allowTools,
        maxTokens: args.maxTokens,
        systemPrompt: args.systemPrompt,
        lastUserContent: args.lastUserContent,
        messageTail: args.messageTail,
        chatTools: args.chatTools,
        signal: signal.signal,
        emitDelta: params.emitDelta,
      });
    } finally {
      signal.cleanup();
    }
  });

  const callModelNode = async (state: ChatToolGraphState): Promise<Partial<ChatToolGraphState>> => {
    const round = state.round + 1;
    const createTool = params.chatTools.find((tool) => toolDefinitionName(tool) === "create_document");
    const mustCreateDocument = Boolean(
      createTool &&
      requestsNewDocument(params.lastUserContent) &&
      hasUsableWebEvidence(state.allExecutableResults)
    );
    const roundTools = mustCreateDocument && createTool ? [createTool] : params.chatTools;
    const allowTools = shouldAllowToolsOnFollowUpRound(round) && roundTools.length > 0;
    const systemPrompt = buildSystemPrompt(allowTools, mustCreateDocument);

    const turn = await callModel({
      round,
      allowTools,
      maxTokens: mustCreateDocument ? 5000 : undefined,
      systemPrompt,
      lastUserContent: params.lastUserContent,
      messageTail: state.messageTail,
      chatTools: roundTools,
      signal: params.parentSignal,
    });

    if (!allowTools) {
      const content = String(turn.content || "");
      if (shouldUseToolFallbackReply(content, state.allExecutableResults)) {
        return { round, stop: true, reply: "", streamedFinal: true };
      }
      const parsed = resolveAssistantActionReply(content);
      if (parsed.reply && !parsed.action && !(turn as { streamedText?: string }).streamedText) {
        params.emitDelta(parsed.reply);
      }
      return {
        round,
        stop: true,
        reply: parsed.reply,
        proposedAction: parsed.action || state.proposedAction,
        streamedFinal: true,
        pendingServerCalls: [],
      };
    }

    const nextCalls = extractToolCallsFromAssistantMessage(turn);
    const proposed = parseClientActionFromToolCalls(nextCalls, params.userLang);
    if (proposed.action) {
      params.emitDelta(proposed.reply);
      return {
        round,
        stop: true,
        reply: proposed.reply,
        proposedAction: proposed.action,
        pendingServerCalls: [],
      };
    }

    // Some OpenAI-compatible providers ignore tool-choice instructions and
    // return the article as plain assistant text. Preserve the user's intent by
    // converting that complete draft into the same confirmable client preview.
    if (mustCreateDocument) {
      const content = assistantTextFromMessage(turn).trim();
      if (content) {
        const recovered = parseClientActionFromToolCalls([{
          name: "create_document",
          arguments: JSON.stringify({ title: markdownTitle(content, params.userLang), content }),
        }], params.userLang);
        if (recovered.action) {
          params.emitDelta(recovered.reply);
          return {
            round,
            stop: true,
            reply: recovered.reply,
            proposedAction: recovered.action,
            pendingServerCalls: [],
          };
        }
      }
    }

    if (!shouldRunAnotherToolRound({
      round,
      hasClientAction: false,
      newToolCalls: nextCalls,
    })) {
      const text = assistantTextFromMessage(turn);
      if (shouldUseToolFallbackReply(text, state.allExecutableResults)) {
        return { round, stop: true, reply: "", pendingServerCalls: [] };
      }
      const parsed = resolveAssistantActionReply(text);
      if (parsed.reply && !parsed.action) {
        params.emitDelta(parsed.reply);
      }
      return {
        round,
        stop: true,
        reply: parsed.reply,
        proposedAction: parsed.action || state.proposedAction,
        pendingServerCalls: [],
      };
    }

    const serverCalls = nextCalls.filter((tc) => tc && !isClientActionTool(tc.name));
    return {
      round,
      stop: false,
      pendingServerCalls: serverCalls,
      reply: state.reply,
      proposedAction: state.proposedAction,
    };
  };

  const runToolsNode = async (state: ChatToolGraphState): Promise<Partial<ChatToolGraphState>> => {
    const serverCalls = state.pendingServerCalls || [];
    if (serverCalls.length === 0) {
      return { stop: true, pendingServerCalls: [] };
    }

    let nextIndex = state.nextIndex;
    for (const toolCall of serverCalls) {
      params.emitToolCalling(nextIndex, toolCall);
      nextIndex += 1;
    }

    const executed = await params.executeToolCalls(serverCalls);
    const execOnly = executed.toolResults.filter((result) => !isClientActionTool(result.name));
    const messageTail = [
      ...state.messageTail,
      ...buildToolFollowUpMessages(serverCalls, execOnly),
    ];

    return {
      nextIndex,
      pendingServerCalls: [],
      additionalToolCalls: [...state.additionalToolCalls, ...serverCalls],
      additionalToolResults: [...state.additionalToolResults, ...executed.toolResults],
      additionalToolCallResults: [...state.additionalToolCallResults, ...executed.toolCallResults],
      allExecutableResults: [...state.allExecutableResults, ...execOnly],
      messageTail,
      stop: false,
    };
  };

  const finalizeNode = async (state: ChatToolGraphState): Promise<Partial<ChatToolGraphState>> => {
    if (state.reply || state.proposedAction) {
      return { stop: true };
    }
    if (state.allExecutableResults.length > 0) {
      const fallback = buildToolFallbackReply(state.allExecutableResults, params.userLang);
      params.emitDelta(fallback);
      return { reply: fallback, stop: true };
    }
    return { stop: true };
  };

  const routeAfterModel = (state: ChatToolGraphState): "runTools" | "finalize" => {
    if (state.stop) return "finalize";
    if (state.pendingServerCalls.length > 0) return "runTools";
    return "finalize";
  };

  const routeAfterTools = (state: ChatToolGraphState): "callModel" | "finalize" => {
    if (state.stop) return "finalize";
    if (state.round >= MAX_CHAT_TOOL_ROUNDS) return "finalize";
    return "callModel";
  };

  const graph = new StateGraph(ChatToolGraphAnnotation)
    .addNode("callModel", callModelNode)
    .addNode("runTools", runToolsNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "callModel")
    .addConditionalEdges("callModel", routeAfterModel, {
      runTools: "runTools",
      finalize: "finalize",
    })
    .addConditionalEdges("runTools", routeAfterTools, {
      callModel: "callModel",
      finalize: "finalize",
    })
    .addEdge("finalize", END)
    .compile();

  const initial: ChatToolGraphState = {
    round: 0,
    messageTail: initialTail as GraphMessage[],
    allExecutableResults: [...params.initialExecutableResults],
    pendingServerCalls: [],
    proposedAction: params.initialAction ?? null,
    reply: "",
    nextIndex: params.nextToolIndex,
    additionalToolCalls: [],
    additionalToolResults: [],
    additionalToolCallResults: [],
    stop: false,
    streamedFinal: false,
  };

  const finalState = await graph.invoke(initial, {
    recursionLimit: MAX_CHAT_TOOL_ROUNDS * 4 + 4,
  }) as ChatToolGraphState;

  let followUpReply = finalState.reply || "";
  let finalAction = finalState.proposedAction ?? null;

  if (!followUpReply && finalState.allExecutableResults.length > 0 && !finalAction) {
    followUpReply = buildToolFallbackReply(finalState.allExecutableResults, params.userLang);
    params.emitDelta(followUpReply);
  }

  return {
    followUpReply,
    finalAction,
    additionalToolCalls: finalState.additionalToolCalls || [],
    additionalToolResults: finalState.additionalToolResults || [],
    additionalToolCallResults: finalState.additionalToolCallResults || [],
  };
}

export function shouldUseChatToolGraph(toolIntent: string, isSelectionEdit: boolean): boolean {
  return !isSelectionEdit && toolIntent === "edit";
}
