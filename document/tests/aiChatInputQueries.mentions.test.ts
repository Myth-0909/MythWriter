import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { textMentionsTitle } from "../src/lib/aiChatInputQueries.ts";

describe("mention token boundaries", () => {
  it("matches @title as a whole token", () => {
    assert.equal(textMentionsTitle("请看 @章节 内容", "章节"), true);
    assert.equal(textMentionsTitle("请看@章节", "章节"), true);
  });

  it("does not match substring titles", () => {
    assert.equal(textMentionsTitle("请看 @章节大纲", "章"), false);
    assert.equal(textMentionsTitle("请看 @AB", "A"), false);
  });
});
