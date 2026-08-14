import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildChatTools, resolveChatToolIntent } from "./aiChatTools";

describe("AI chat tool policy", () => {
  it("exposes client proposal tools plus the full read-only catalog by default", () => {
    const toolNames = buildChatTools().map((tool) => tool.function.name);

    assert.deepEqual(
      toolNames,
      [
        "create_document",
        "patch_document",
        "update_document",
        "spreadsheet_patch",
        "search_web",
        "get_user_stats",
        "list_documents",
        "get_document_summary",
        "search_documents",
        "list_spreadsheets",
        "get_spreadsheet_summary",
        "search_spreadsheets",
        "list_recent_documents",
        "list_favorite_documents",
        "list_trashed_documents",
        "get_today_writing",
        "get_writing_range_stats",
        "get_weekly_writing_stats",
        "list_work_records",
        "get_current_work_record",
        "list_document_groups",
        "list_document_versions",
        "list_brain_knowledge",
        "search_brain_knowledge",
        "list_brain_categories",
        "search_document_semantic",
        "search_knowledge_semantic",
        "get_rag_status",
      ]
    );
  });

  it("classifies casual chat vs edit vs workspace queries", () => {
    assert.equal(resolveChatToolIntent("你好"), "chat");
    assert.equal(resolveChatToolIntent("帮我润色第二段"), "edit");
    assert.equal(resolveChatToolIntent("今天写了多少字？"), "workspace");
    assert.equal(resolveChatToolIntent("杭州今天天气怎么样"), "web");
  });

  it("treats generate-a-document requests as edit even when the topic is news", () => {
    assert.equal(resolveChatToolIntent("生成一份最近kimi k3 的相关新闻"), "edit");
    assert.equal(resolveChatToolIntent("写一份关于 AI 的简报"), "edit");
    assert.equal(resolveChatToolIntent("帮我生成一篇周报"), "edit");
    assert.equal(resolveChatToolIntent("最近有什么新闻"), "web");
  });

  it("exposes create_document for generate-a-news-document requests", () => {
    const intent = resolveChatToolIntent("生成一份最近kimi k3 的相关新闻");
    const names = buildChatTools(intent).map((tool) => tool.function.name);
    assert.ok(names.includes("create_document"));
    assert.ok(names.includes("search_web"));
  });

  it("omits client action tools for casual chat", () => {
    const names = buildChatTools("chat").map((tool) => tool.function.name);
    assert.ok(!names.includes("create_document"));
    assert.ok(!names.includes("update_document"));
    assert.ok(names.includes("search_web"));
    assert.ok(names.includes("get_today_writing"));
  });

  it("includes client action tools for edit intents", () => {
    const names = buildChatTools("edit").map((tool) => tool.function.name);
    assert.ok(names.includes("patch_document"));
    assert.ok(names.includes("create_document"));
    assert.ok(names.includes("spreadsheet_patch"));
  });
});
