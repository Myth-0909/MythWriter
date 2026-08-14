import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { truncateApiChatMessages } from "./aiChatHistory";

describe("server api chat history truncation", () => {
  it("keeps the newest messages under the char budget", () => {
    const messages = [
      { role: "user", content: "a".repeat(3000) },
      { role: "assistant", content: "b".repeat(3000) },
      { role: "user", content: "latest" },
    ];
    const truncated = truncateApiChatMessages(messages, 3500);
    assert.equal(truncated[truncated.length - 1]?.content, "latest");
    assert.ok(truncated.length < messages.length);
  });

  it("clips a single oversized user message and tool arguments", () => {
    const result = truncateApiChatMessages([{
      role: "user",
      content: "x".repeat(30_000),
      tool_calls: [{
        id: "call-1",
        type: "function",
        function: { name: "search_web", arguments: "y".repeat(10_000) },
      }],
    }]);

    assert.ok(String(result[0].content).length <= 12_001);
    assert.ok(String(result[0].tool_calls?.[0]?.function?.arguments).length <= 4_001);
  });
});
