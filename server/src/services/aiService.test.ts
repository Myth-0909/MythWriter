import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "./aiService";

describe("ai assistant branding", () => {
  it("identifies the assistant as XiaoAn in the system prompt", () => {
    const prompt = buildSystemPrompt("normal", "");

    assert.match(prompt, /小安/);
    assert.match(prompt, /XiaoAn/);
    assert.doesNotMatch(prompt, /ZNWriter AI/);
    assert.doesNotMatch(prompt, /小麦|XiaoMai/);
  });
});
