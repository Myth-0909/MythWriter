import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildToolFallbackReply,
  buildToolFollowUpMessages,
  buildToolResultSummary,
  extractDsmlToolCalls,
  shouldUseToolFallbackReply,
  type AssistantToolCall,
  type AssistantToolResult,
} from "./aiToolConversation";

describe("ai tool conversation helpers", () => {
  it("extracts DSML tool calls from text responses", () => {
    const parsed = extractDsmlToolCalls('<|DSML|tool_calls><|DSML|invoke name="get_today_writing"></|DSML|invoke></|DSML|tool_calls>');

    assert.equal(parsed.cleanContent, "");
    assert.deepEqual(parsed.toolCalls, [
      { id: "", name: "get_today_writing", arguments: "{}" },
    ]);
  });

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

  it("describes today's edited document words without claiming they are new words", () => {
    const results: AssistantToolResult[] = [
      {
        index: 0,
        name: "get_today_writing",
        status: "done",
        result: "188 words in touched items today",
        content: [
          "今日写作统计（2026-07-07）：",
          "- 今日更新文档 2 篇，当前共 148 字",
          "- 今日随记 1 条，共 40 字",
          "- 可确认合计 188 字",
        ].join("\n"),
      },
    ];

    const reply = buildToolFallbackReply(results, "zh");

    assert.match(reply, /今日更新文档 2 篇/);
    assert.match(reply, /当前共 148 字/);
    assert.doesNotMatch(reply, /新增/);
  });

  it("treats tool-completion placeholder replies as unusable", () => {
    const results: AssistantToolResult[] = [
      {
        index: 0,
        name: "get_user_stats",
        status: "done",
        result: "9 docs, 4 journals",
        content: "用户工作区统计：\n- 文档总数：9 篇\n- 随记总数：4 条\n- 随记总字数：223 字\n- 文档分组：2 个\n- 脑库条目：5 条",
      },
      {
        index: 1,
        name: "list_recent_documents",
        status: "done",
        result: "5 docs",
        content: "用户最近 5 篇文档：\n1. 《第一章》— 1200 字，最后修改 2026-07-07",
      },
    ];

    const placeholder = "让我查查你的写作数据，给你做个分析～已完成操作（get_user_stats、get_today_writing、list_recent_documents），请查看结果。";

    assert.equal(shouldUseToolFallbackReply(placeholder, results), true);
  });

  it("includes recent document clues in fallback writing-state answers", () => {
    const results: AssistantToolResult[] = [
      {
        index: 0,
        name: "get_user_stats",
        status: "done",
        result: "9 docs, 4 journals",
        content: "用户工作区统计：\n- 文档总数：9 篇\n- 随记总数：4 条\n- 随记总字数：223 字\n- 文档分组：2 个\n- 脑库条目：5 条",
      },
      {
        index: 1,
        name: "list_recent_documents",
        status: "done",
        result: "5 docs",
        content: "用户最近 5 篇文档：\n1. 《第一章》— 1200 字，最后修改 2026-07-07\n2. 《第二章》— 900 字，最后修改 2026-07-06",
      },
    ];

    const reply = buildToolFallbackReply(results, "zh");

    assert.match(reply, /最近文档/);
    assert.match(reply, /第一章/);
    assert.match(reply, /第二章/);
  });

  it("summarizes known tool results into compact UI evidence", () => {
    const statsSummary = buildToolResultSummary(
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
      "zh"
    );
    const todaySummary = buildToolResultSummary(
      {
        index: 1,
        name: "get_today_writing",
        status: "done",
        result: "188 words today",
        content: [
          "今日写作统计（2026-07-07）：",
          "- 今日更新文档 2 篇，当前共 148 字",
          "- 今日随记 1 条，共 40 字",
          "- 可确认合计 188 字",
        ].join("\n"),
      },
      "zh"
    );
    const recentSummary = buildToolResultSummary(
      {
        index: 2,
        name: "list_recent_documents",
        status: "done",
        result: "5 docs",
        content: "用户最近 5 篇文档：\n1. 《第一章》— 1200 字，最后修改 2026-07-07",
      },
      "zh"
    );

    assert.match(statsSummary, /文档 12 篇/);
    assert.match(statsSummary, /随记 3 条/);
    assert.match(statsSummary, /脑库 4 条/);
    assert.match(todaySummary, /今日 188 字/);
    assert.match(todaySummary, /文档 2 篇/);
    assert.match(recentSummary, /第一章/);
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
