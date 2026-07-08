import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildChatTools } from "./aiChatTools";

describe("AI chat tool policy", () => {
  it("exposes the full read-only tool catalog without write tools", () => {
    const toolNames = buildChatTools().map((tool) => tool.function.name);

    assert.deepEqual(
      toolNames,
      [
        "search_web",
        "get_user_stats",
        "list_documents",
        "get_document_summary",
        "search_documents",
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
    assert.ok(!toolNames.includes("create_document"));
    assert.ok(!toolNames.includes("update_document"));
  });
});
