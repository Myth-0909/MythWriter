import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveChatRequestTools } from "./aiChatTools";

describe("selection edit tool policy", () => {
  it("disables tools for selection_edit regardless of edit-intent wording", () => {
    const tools = resolveChatRequestTools({
      purpose: "selection_edit",
      userText: "请对以下选中的文字执行【改写】操作",
    });
    assert.deepEqual(tools, []);
  });

  it("keeps edit tools for normal chat edit intents", () => {
    const tools = resolveChatRequestTools({
      purpose: "chat",
      userText: "帮我润色第二段",
    });
    assert.ok(tools.some((tool) => tool.function.name === "patch_document"));
  });
});
