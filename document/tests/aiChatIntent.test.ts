import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldAttachCurrentWorkspace,
  resolveChatMaxTokenMode,
} from "../src/lib/aiChatIntent.ts";

describe("ai chat intent gating", () => {
  it("does not attach current workspace for casual greetings", () => {
    assert.equal(shouldAttachCurrentWorkspace("你好"), false);
    assert.equal(shouldAttachCurrentWorkspace("在吗"), false);
    assert.equal(shouldAttachCurrentWorkspace("hello"), false);
    assert.equal(shouldAttachCurrentWorkspace("thanks!"), false);
  });

  it("attaches current workspace for write/edit intents", () => {
    assert.equal(shouldAttachCurrentWorkspace("帮我改一下第二段"), true);
    assert.equal(shouldAttachCurrentWorkspace("润色这篇文档"), true);
    assert.equal(shouldAttachCurrentWorkspace("rewrite the intro"), true);
    assert.equal(shouldAttachCurrentWorkspace("在表格里加一行"), true);
    assert.equal(shouldAttachCurrentWorkspace("总结一下当前内容"), true);
    assert.equal(shouldAttachCurrentWorkspace("帮我看看这篇文章哪里不好"), true);
    assert.equal(shouldAttachCurrentWorkspace("读一下当前文档，给点建议"), true);
    assert.equal(shouldAttachCurrentWorkspace("这篇写得怎么样？"), true);
  });

  it("attaches when the user already pinned or mentioned references", () => {
    assert.equal(shouldAttachCurrentWorkspace("看看这个", { hasManualReferences: true }), true);
    assert.equal(shouldAttachCurrentWorkspace("对比 @大纲"), true);
  });

  it("uses compact max_tokens mode for Q&A without edit intent", () => {
    assert.equal(resolveChatMaxTokenMode("今天写了多少字？"), "compact");
    assert.equal(resolveChatMaxTokenMode("帮我全文重写"), "expand");
    assert.equal(resolveChatMaxTokenMode("改这一段"), "expand");
  });
});
