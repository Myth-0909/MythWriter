import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt, resolveAssistantActionReply } from "./aiService";

describe("ai assistant branding", () => {
  it("identifies the assistant as XiaoAn in the system prompt", () => {
    const prompt = buildSystemPrompt("normal", "");

    assert.match(prompt, /小安/);
    assert.match(prompt, /XiaoAn/);
    assert.doesNotMatch(prompt, /ZNWriter AI/);
    assert.doesNotMatch(prompt, /小麦|XiaoMai/);
  });

  it("includes current date and time context", () => {
    const prompt = buildSystemPrompt("normal", "");

    assert.match(prompt, /Current date and time:/);
    assert.match(prompt, /ISO 8601:/);
    assert.match(prompt, /Day of week:/);
  });

  it("extracts document creation actions from tool follow-up replies", () => {
    const rawReply = [
      "好的，我先查了最新信息。",
      '<<ACTION_JSON>>{"reply":"已为您生成文档「杭州周末台风防御指南」，请查看~","action":{"type":"create_document","title":"杭州周末台风防御指南","content":"# 杭州周末台风防御指南\\n\\n请关注预警并减少外出。"}}<<ACTION_JSON_END>>',
    ].join("\n\n");

    const parsed = resolveAssistantActionReply(rawReply);

    assert.equal(parsed.reply, "已为您生成文档「杭州周末台风防御指南」，请查看~");
    assert.deepEqual(parsed.action, {
      type: "create_document",
      title: "杭州周末台风防御指南",
      content: "# 杭州周末台风防御指南\n\n请关注预警并减少外出。",
    });
    assert.doesNotMatch(parsed.reply, /ACTION_JSON/);
  });
});
