import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSendAssistantFeedback,
  filterApiHistoryToolCalls,
  resolveAssistantActionContent,
  shouldIncludeAssistantInPrompt,
} from "../src/lib/aiChatStream";
import { toApiMessages } from "../src/lib/aiChatApiMessages";

describe("AI chat stream UX helpers", () => {
  it("uses the settled assistant content for copy and feedback actions", () => {
    assert.equal(
      resolveAssistantActionContent({ content: "half typed", finalContent: "complete answer" }),
      "complete answer"
    );
  });

  it("does not allow feedback for typing or interrupted assistant messages", () => {
    assert.equal(canSendAssistantFeedback({ content: "partial", isTyping: true }), false);
    assert.equal(canSendAssistantFeedback({ content: "partial", interrupted: true }), false);
    assert.equal(canSendAssistantFeedback({ content: "complete answer" }), true);
  });

  it("excludes interrupted assistant messages from future prompt context", () => {
    assert.equal(shouldIncludeAssistantInPrompt({ content: "partial", interrupted: true }), false);
    assert.equal(shouldIncludeAssistantInPrompt({ content: "complete answer" }), true);
  });

  it("keeps only successful tool calls with usable results in API history", () => {
    const toolCalls = [
      { status: "error", content: "Error: failed", name: "get_today_writing" },
      { status: "done", content: "", summary: "", result: "", name: "empty_tool" },
      { status: "done", summary: "9 docs, 4 journals", name: "get_user_stats" },
    ];

    assert.deepEqual(filterApiHistoryToolCalls(toolCalls), [toolCalls[2]]);
  });

  it("drops standalone tool history messages before sending API history", () => {
    const messages = toApiMessages([
      { role: "user", content: "我今天写了多少？" },
      { role: "tool", tool_call_id: "call_orphan", content: "今日写作统计：188 字" },
      { role: "user", content: "我问的是写了几篇文章" },
    ]);

    assert.deepEqual(messages, [
      { role: "user", content: "我今天写了多少？" },
      { role: "user", content: "我问的是写了几篇文章" },
    ]);
  });

  it("sends successful tool calls together with matching tool results", () => {
    const messages = toApiMessages([
      {
        role: "assistant",
        content: "我查到今天的数据了。",
        toolCalls: [
          {
            index: 0,
            name: "get_today_writing",
            arguments: "{}",
            status: "done",
            content: "今日写作统计（2026-07-08）：\n- 今日更新文档 2 篇，当前共 519 字",
          },
        ],
      },
    ]);

    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "assistant");
    assert.equal(messages[0].tool_calls?.[0]?.id, "call_0");
    assert.equal(messages[1].role, "tool");
    assert.equal(messages[1].tool_call_id, "call_0");
    assert.match(messages[1].content, /519 字/);
  });

  it("keeps failed tool-call turns as plain assistant history", () => {
    const messages = toApiMessages([
      {
        role: "assistant",
        content: "刚才没查到结果，我可以再试一次。",
        toolCalls: [
          {
            index: 0,
            name: "get_today_writing",
            arguments: "{}",
            status: "error",
            content: "Error: database unavailable",
          },
        ],
      },
    ]);

    assert.deepEqual(messages, [
      { role: "assistant", content: "刚才没查到结果，我可以再试一次。" },
    ]);
  });
});
