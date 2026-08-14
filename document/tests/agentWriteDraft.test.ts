import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAgentWriteDraftStorageKey,
  parseStoredAgentWriteDraft,
  serializeStoredAgentWriteDraft,
} from "../src/lib/agentWriteDraft.ts";

describe("agent write draft recovery", () => {
  it("isolates recovery data by user id", () => {
    assert.equal(getAgentWriteDraftStorageKey("user-a"), "znwriter_agent_write_draft:user-a");
    assert.notEqual(getAgentWriteDraftStorageKey("user-a"), getAgentWriteDraftStorageKey("user-b"));
    assert.equal(getAgentWriteDraftStorageKey(""), null);
  });

  it("restores a sanitized unsaved result", () => {
    const restored = parseStoredAgentWriteDraft(JSON.stringify({
      goal: "写一篇文章",
      stylePrompt: "简洁",
      wordCount: "600 words",
      includeDocuments: true,
      selectedDocIds: ["doc-1", "doc-1", ""],
      result: {
        docId: null,
        title: "草稿",
        content: "# 草稿\n\n正文",
        analysis: { genre: "文章", tone: "简洁", themes: ["主题"], estimatedWords: 600 },
        outline: [{ heading: "开头", brief: "引入" }],
        review: { score: 88, suggestions: [{ detail: "补充例子", severity: "medium" }] },
        sources: [],
      },
    }));

    assert.ok(restored);
    assert.equal(restored.wordCount, "600");
    assert.deepEqual(restored.selectedDocIds, ["doc-1"]);
    assert.equal(restored.result?.content, "# 草稿\n\n正文");
    assert.equal(restored.result?.review.score, 88);
  });

  it("drops malformed or empty recovery results", () => {
    assert.equal(parseStoredAgentWriteDraft("not-json"), null);
    assert.equal(parseStoredAgentWriteDraft(JSON.stringify({ result: { content: "" } }))?.result, undefined);
  });

  it("keeps source identity but omits private excerpts from browser recovery", () => {
    const serialized = serializeStoredAgentWriteDraft({
      goal: "写总结",
      stylePrompt: "",
      wordCount: "600",
      includeBrain: false,
      includeDocuments: true,
      includeJournal: false,
      includeWeb: false,
      selectedDocIds: ["doc-1"],
      selectedBrainIds: [],
      selectedJournalIds: [],
      savedAt: 1,
      result: {
        docId: null,
        title: "总结",
        content: "正文",
        analysis: { genre: "总结", tone: "自然", themes: [], estimatedWords: 600 },
        outline: [],
        review: { score: 80, suggestions: [] },
        sources: [{ type: "document", id: "doc-1", title: "私密文档", excerpt: "不应写入本地恢复" }],
      },
    });

    assert.doesNotMatch(serialized, /不应写入本地恢复/);
    assert.equal(parseStoredAgentWriteDraft(serialized)?.result?.sources[0]?.title, "私密文档");
  });
});
