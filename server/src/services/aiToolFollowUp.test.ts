import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assistantTextFromMessage,
  extractToolCallsFromAssistantMessage,
} from "./aiToolFollowUp";

describe("aiToolFollowUp message parsing", () => {
  it("extracts native tool_calls", () => {
    const calls = extractToolCallsFromAssistantMessage({
      content: "",
      tool_calls: [
        {
          id: "call_1",
          function: { name: "search_web", arguments: '{"query":"x"}' },
        },
      ],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "search_web");
    assert.equal(calls[0].arguments, '{"query":"x"}');
  });

  it("strips dsml tool markup from assistant text", () => {
    const text = assistantTextFromMessage({
      content:
        'Here is the answer.<|DSML|tool_calls><|DSML|invoke name="search_web"></|DSML|invoke></|DSML|tool_calls>',
    });
    assert.equal(text, "Here is the answer.");
  });
});
