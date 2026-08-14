import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateMessageChars, truncateChatHistory, summarizeDroppedChatHistory } from "../src/lib/aiChatHistory.ts";

describe("ai chat history truncation", () => {
  it("keeps recent turns within a character budget", () => {
    const messages = [
      { role: "user", content: "a".repeat(2000) },
      { role: "assistant", content: "b".repeat(2000) },
      { role: "user", content: "c".repeat(2000) },
      { role: "assistant", content: "d".repeat(2000) },
      { role: "user", content: "latest question" },
    ];

    const truncated = truncateChatHistory(messages, { maxChars: 4500 });
    assert.ok(estimateMessageChars(truncated) <= 4500);
    assert.equal(truncated[truncated.length - 1]?.content, "latest question");
    assert.ok(truncated.length < messages.length);
  });

  it("prefers tool summaries over bulky tool content", () => {
    const messages = [
      {
        role: "assistant",
        content: "查找中",
        toolCalls: [
          {
            index: 0,
            id: "call_1",
            name: "search_web",
            arguments: "{}",
            status: "done",
            summary: "5 results",
            content: "x".repeat(5000),
            result: "ok",
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "x".repeat(5000),
      },
      { role: "user", content: "继续" },
    ];

    const truncated = truncateChatHistory(messages, { maxChars: 2000 });
    const assistant = truncated.find((m) => m.role === "assistant");
    const toolCall = assistant?.toolCalls?.[0];
    assert.ok(toolCall);
    assert.ok(String(toolCall.content || "").length <= 400);
    assert.match(String(toolCall.content || ""), /5 results|ok/);
  });

  it("summarizes dropped prefix turns for memoryContext", () => {
    const messages = [
      { role: "user", content: "old topic alpha" },
      { role: "assistant", content: "old answer alpha" },
      { role: "user", content: "latest question" },
    ];
    const kept = truncateChatHistory(messages, { maxChars: 40 });
    const summary = summarizeDroppedChatHistory(messages, kept);
    if (kept.length < messages.length) {
      assert.match(summary, /User:|Assistant:/);
    } else {
      assert.equal(summary, "");
    }
  });

});
