import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_TOOL_GRAPH_POLICY,
  runChatToolGraph,
  shouldUseChatToolGraph,
  type ChatToolGraphCallModel,
} from "./chatToolGraph";
import { MAX_CHAT_TOOL_ROUNDS } from "./aiToolLoop";

function baseParams(overrides: Partial<Parameters<typeof runChatToolGraph>[0]> = {}) {
  return {
    apiUrl: "http://example.test/v1/chat/completions",
    apiKey: "test-key",
    aiModel: "test-model",
    userLang: "zh",
    lastUserContent: "生成一份最近 kimi 的相关新闻",
    chatTools: [{ type: "function", function: { name: "create_document" } }],
    parentSignal: new AbortController().signal,
    initialToolCalls: [
      { id: "call_search", name: "search_web", arguments: JSON.stringify({ query: "kimi news" }) },
    ],
    initialExecutableResults: [
      {
        index: 0,
        name: "search_web",
        status: "done",
        result: "kimi news",
        content: "Web search results for kimi news:\n- Kimi released updates.\nURL: https://example.com/kimi-news",
      },
    ],
    nextToolIndex: 1,
    executeToolCalls: async () => ({ toolResults: [], toolCallResults: [] }),
    emitDelta: () => {},
    emitToolCalling: () => {},
    ...overrides,
  };
}

describe("chat tool LangGraph", () => {
  it("exposes a search-then-create policy for edit workflows", () => {
    assert.match(CHAT_TOOL_GRAPH_POLICY, /search_web/);
    assert.match(CHAT_TOOL_GRAPH_POLICY, /create_document/);
    assert.equal(shouldUseChatToolGraph("edit", false), true);
    assert.equal(shouldUseChatToolGraph("edit", true), false);
    assert.equal(shouldUseChatToolGraph("web", false), false);
  });

  it("proposes create_document after search_web and stops without further rounds", async () => {
    let modelCalls = 0;
    const deltas: string[] = [];
    const callModel: ChatToolGraphCallModel = async (args) => {
      modelCalls += 1;
      assert.deepEqual(
        args.chatTools.map((tool: any) => tool.function?.name),
        ["create_document"]
      );
      assert.match(args.systemPrompt, /MUST now call create_document/);
      assert.equal(args.maxTokens, 5000);
      return {
        content: "",
        tool_calls: [
          {
            id: "call_create",
            function: {
              name: "create_document",
              arguments: JSON.stringify({
                title: "Kimi 近况简报",
                content: "# Kimi 近况\n\n根据检索，Kimi 近期有产品更新。",
              }),
            },
          },
        ],
      };
    };

    const result = await runChatToolGraph(
      baseParams({
        callModel,
        emitDelta: (delta) => deltas.push(delta),
      })
    );

    assert.equal(modelCalls, 1);
    assert.ok(result.finalAction);
    assert.equal((result.finalAction as { type: string }).type, "create_document");
    assert.equal((result.finalAction as { title: string }).title, "Kimi 近况简报");
    assert.match(result.followUpReply, /创建文档|Creating document/);
    assert.equal(result.additionalToolCalls.length, 0);
    assert.ok(deltas.length >= 1);
  });

  it("turns a chat-only article into a confirmable document preview after search", async () => {
    const result = await runChatToolGraph(
      baseParams({
        callModel: async () => ({
          content: "# DeepSeek V4 Pro 正式版\n\n这是一篇基于联网资料撰写的文章。",
        }),
      })
    );

    assert.equal((result.finalAction as { type: string }).type, "create_document");
    assert.equal((result.finalAction as { title: string }).title, "DeepSeek V4 Pro 正式版");
    assert.match((result.finalAction as { content: string }).content, /基于联网资料/);
    assert.match(result.followUpReply, /创建文档/);
  });

  it("runs another readonly tool round then finalizes with a create_document proposal", async () => {
    let modelCalls = 0;
    const callModel: ChatToolGraphCallModel = async () => {
      modelCalls += 1;
      if (modelCalls === 1) {
        return {
          tool_calls: [
            {
              id: "call_stats",
              function: { name: "get_today_writing", arguments: "{}" },
            },
          ],
        };
      }
      return {
        tool_calls: [
          {
            id: "call_create",
            function: {
              name: "create_document",
              arguments: JSON.stringify({
                title: "今日写作简报",
                content: "# 简报\n\n今日有写作记录。",
              }),
            },
          },
        ],
      };
    };

    const executedNames: string[] = [];
    const result = await runChatToolGraph(
      baseParams({
        callModel,
        executeToolCalls: async (toolCalls) => {
          executedNames.push(...toolCalls.map((tc) => tc.name));
          return {
            toolResults: toolCalls.map((tc, index) => ({
              index,
              name: tc.name,
              status: "done" as const,
              result: "ok",
              content: `${tc.name} result`,
            })),
            toolCallResults: toolCalls.map((tc, index) => ({
              index,
              name: tc.name,
              status: "done",
              result: "ok",
            })),
          };
        },
      })
    );

    assert.equal(modelCalls, 2);
    assert.deepEqual(executedNames, ["get_today_writing"]);
    assert.equal((result.finalAction as { type: string }).type, "create_document");
    assert.equal(result.additionalToolCalls.length, 1);
  });

  it("respects the max tool-round cap and falls back to tool results", async () => {
    let modelCalls = 0;
    const callModel: ChatToolGraphCallModel = async () => {
      modelCalls += 1;
      return {
        tool_calls: [
          {
            id: `call_${modelCalls}`,
            function: { name: "get_user_stats", arguments: "{}" },
          },
        ],
      };
    };

    const result = await runChatToolGraph(
      baseParams({
        callModel,
        lastUserContent: "统计一下",
        executeToolCalls: async (toolCalls) => ({
          toolResults: toolCalls.map((tc, index) => ({
            index,
            name: tc.name,
            status: "done" as const,
            result: "42",
            content: "stats: 42 docs",
          })),
          toolCallResults: [],
        }),
      })
    );

    // Rounds 1..(MAX-1) can call tools; then finalize without infinite looping.
    assert.ok(modelCalls <= MAX_CHAT_TOOL_ROUNDS);
    assert.equal(result.finalAction, null);
    assert.ok(result.followUpReply.length > 0 || result.additionalToolResults.length > 0);
  });
});
