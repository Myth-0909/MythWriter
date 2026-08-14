import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_CHAT_TOOL_ROUNDS,
  shouldAllowToolsOnFollowUpRound,
  shouldRunAnotherToolRound,
} from "./aiToolLoop";

describe("bounded chat tool loop", () => {
  it("allows tools on intermediate follow-up rounds only", () => {
    assert.equal(shouldAllowToolsOnFollowUpRound(1), true);
    assert.equal(shouldAllowToolsOnFollowUpRound(2), true);
    assert.equal(shouldAllowToolsOnFollowUpRound(3), false);
    assert.equal(MAX_CHAT_TOOL_ROUNDS, 3);
  });

  it("stops when client action is proposed or no new tool calls", () => {
    assert.equal(
      shouldRunAnotherToolRound({
        round: 1,
        hasClientAction: true,
        newToolCalls: [{ name: "search_web" }],
      }),
      false
    );
    assert.equal(
      shouldRunAnotherToolRound({
        round: 1,
        hasClientAction: false,
        newToolCalls: [],
      }),
      false
    );
    assert.equal(
      shouldRunAnotherToolRound({
        round: 1,
        hasClientAction: false,
        newToolCalls: [{ name: "get_document_summary" }],
      }),
      true
    );
    assert.equal(
      shouldRunAnotherToolRound({
        round: 3,
        hasClientAction: false,
        newToolCalls: [{ name: "search_web" }],
      }),
      false
    );
  });
});
