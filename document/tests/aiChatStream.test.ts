import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSendAssistantFeedback,
  resolveAssistantActionContent,
  shouldIncludeAssistantInPrompt,
} from "../src/lib/aiChatStream";

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
});
