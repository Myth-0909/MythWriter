import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildChatTools } from "./aiChatTools";

describe("AI chat tool policy", () => {
  it("does not expose document write tools to the chat model", () => {
    const toolNames = buildChatTools().map((tool) => tool.function.name);

    assert.ok(toolNames.includes("search_web"));
    assert.ok(toolNames.includes("get_user_stats"));
    assert.ok(!toolNames.includes("create_document"));
    assert.ok(!toolNames.includes("update_document"));
  });
});
