import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildToolFallbackReply,
  buildToolFollowUpMessages,
  type AssistantToolCall,
  type AssistantToolResult,
} from "./aiToolConversation";

describe("ai tool conversation helpers", () => {
  it("turns writing-stat tool results into a concrete fallback answer", () => {
    const results: AssistantToolResult[] = [
      {
        index: 0,
        name: "get_user_stats",
        status: "done",
        result: "12 docs, 3 journals",
        content: [
          "用户工作区统计：",
          "- 文档总数：12 篇",
          "- 随记总数：3 条",
          "- 随记总字数：223 字",
          "- 文档分组：2 个",
          "- 脑库条目：4 条",
        ].join("\n"),
      },
      {
        index: 1,
        name: "get_today_writing",
        status: "done",
        result: "188 words today",
        content: [
          "今日写作统计（2026-07-07）：",
          "- 修改文档 2 篇，新增 148 字",
          "- 随记 1 条，共 40 字",
          "- 合计 188 字",
        ].join("\n"),
      },
    ];

    const reply = buildToolFallbackReply(results, "zh");

    assert.match(reply, /12 篇文档/);
    assert.match(reply, /3 条随记/);
    assert.match(reply, /今天（2026-07-07）/);
    assert.match(reply, /合计 188 字/);
    assert.doesNotMatch(reply, /请查看结果/);
  });

  it("builds valid follow-up messages even when streamed tool call ids are missing", () => {
    const toolCalls: AssistantToolCall[] = [
      { id: "", name: "get_user_stats", arguments: "{}" },
      { id: "call_existing", name: "get_today_writing", arguments: "{}" },
    ];
    const toolResults: AssistantToolResult[] = [
      { index: 0, name: "get_user_stats", status: "done", content: "stats" },
      { index: 1, name: "get_today_writing", status: "done", content: "today" },
    ];

    const messages = buildToolFollowUpMessages(toolCalls, toolResults);
    const assistant = messages[0];
    const firstTool = messages[1];
    const secondTool = messages[2];

    assert.equal(assistant.role, "assistant");
    assert.equal(assistant.content, "");
    assert.equal(assistant.tool_calls?.[0]?.id, "call_0");
    assert.equal(firstTool.role, "tool");
    assert.equal(secondTool.role, "tool");
    if (firstTool.role !== "tool" || secondTool.role !== "tool") {
      throw new Error("Expected tool result messages");
    }
    assert.equal(firstTool.tool_call_id, "call_0");
    assert.equal(secondTool.tool_call_id, "call_existing");
  });

  it("omits tool calls that did not produce a result from the follow-up payload", () => {
    const toolCalls: AssistantToolCall[] = [
      { id: "call_missing", name: "search_web", arguments: "{}" },
      { id: "call_stats", name: "get_user_stats", arguments: "{}" },
    ];
    const toolResults: AssistantToolResult[] = [
      { index: 1, name: "get_user_stats", status: "done", content: "stats" },
    ];

    const messages = buildToolFollowUpMessages(toolCalls, toolResults);
    const assistant = messages[0];
    const tool = messages[1];

    assert.equal(assistant.role, "assistant");
    assert.equal(assistant.tool_calls.length, 1);
    assert.equal(assistant.tool_calls[0].id, "call_stats");
    assert.equal(tool.role, "tool");
    if (tool.role !== "tool") throw new Error("Expected tool result message");
    assert.equal(tool.tool_call_id, "call_stats");
  });
});
