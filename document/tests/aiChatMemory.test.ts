import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConversationTitle,
  createClientConversationId,
  getScopedAiChatStorageKeys,
  hasMeaningfulUserTurn,
  hydrateMessagesFromServer,
  shouldPreferServerConversation,
} from "../src/lib/aiChatMemory.ts";

describe("ai chat memory helpers", () => {
  it("creates stable-format client conversation ids before the first save", () => {
    const first = createClientConversationId();
    const second = createClientConversationId();
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(first, second);
  });

  it("isolates local chat caches by user scope", () => {
    const first = getScopedAiChatStorageKeys("user-a");
    const second = getScopedAiChatStorageKeys("user-b");
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first.memory, second.memory);
    assert.notEqual(first.activeConversation, second.activeConversation);
    assert.equal(getScopedAiChatStorageKeys(""), null);
  });

  it("builds a title from the first user message", () => {
    assert.equal(
      buildConversationTitle([
        { role: "assistant", content: "你好" },
        { role: "user", content: "帮我润色这段开场白" },
      ]),
      "帮我润色这段开场白"
    );
  });

  it("truncates long titles", () => {
    const long = "这是一段非常非常非常非常非常非常非常非常非常非常长的用户提问内容";
    assert.equal(buildConversationTitle([{ role: "user", content: long }]).endsWith("…"), true);
    assert.ok(buildConversationTitle([{ role: "user", content: long }]).length <= 25);
  });

  it("falls back when there is no user message", () => {
    assert.equal(buildConversationTitle([{ role: "assistant", content: "hi" }], "New chat"), "New chat");
  });

  it("does not treat an assistant-only greeting as a real conversation", () => {
    assert.equal(hasMeaningfulUserTurn([{ role: "assistant", content: "你好" }]), false);
    assert.equal(hasMeaningfulUserTurn([{ role: "user", content: "  " }]), false);
    assert.equal(hasMeaningfulUserTurn([{ role: "user", content: "帮我写一个开头" }]), true);
  });

  it("hydrates server messages and drops incomplete typing placeholders", () => {
    const msgs = hydrateMessagesFromServer([
      { role: "user", content: "a" },
      { role: "assistant", content: "", isTyping: true },
      { role: "assistant", content: "done", finalContent: "done" },
    ]);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[1].content, "done");
  });

  it("prefers server conversation over local cache when server has messages", () => {
    assert.equal(shouldPreferServerConversation([{ role: "user", content: "x" }], [{ role: "user", content: "local" }]), true);
    assert.equal(shouldPreferServerConversation([{ role: "user", content: "older" }], [{ role: "user", content: "unsaved" }], false), false);
    assert.equal(shouldPreferServerConversation([{ role: "user", content: "server" }], [{ role: "assistant", content: "hello" }], false), true);
    assert.equal(shouldPreferServerConversation([{ role: "assistant", content: "你好" }], [{ role: "user", content: "local" }]), false);
    assert.equal(shouldPreferServerConversation([], [{ role: "user", content: "local" }]), false);
  });
});
