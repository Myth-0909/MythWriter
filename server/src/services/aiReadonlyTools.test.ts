import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeReadonlyChatTool,
  inferReadonlyToolCalls,
} from "./aiReadonlyTools";

const now = new Date("2026-07-08T08:00:00.000Z");

function createMockDeps() {
  const documents = [
    {
      id: "doc-1",
      title: "第一章",
      content: "<p>林动 今天 练功</p>",
      preview: "林动 今天 练功",
      category: "general",
      isFavorite: true,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date("2026-07-08T01:00:00.000Z"),
      updatedAt: new Date("2026-07-08T02:00:00.000Z"),
      userId: "u1",
      groupId: "group-1",
    },
    {
      id: "doc-2",
      title: "旧设定",
      content: "<p>旧内容</p>",
      preview: "旧内容",
      category: "research",
      isFavorite: false,
      isDeleted: true,
      deletedAt: new Date("2026-07-08T03:00:00.000Z"),
      createdAt: new Date("2026-07-01T01:00:00.000Z"),
      updatedAt: new Date("2026-07-02T02:00:00.000Z"),
      userId: "u1",
      groupId: null,
    },
  ];
  const workRecords = [
    {
      id: "wr-1",
      userId: "u1",
      period: "daily",
      targetDate: new Date("2026-07-08T00:00:00.000Z"),
      title: "今日随记",
      content: "写了新章节",
      aiSummary: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const versions = [
    {
      id: "ver-1",
      documentId: "doc-1",
      userId: "u1",
      title: "第一章",
      content: "<p>旧版本</p>",
      preview: "旧版本",
      source: "manual",
      createdAt: new Date("2026-07-08T04:00:00.000Z"),
    },
  ];
  const knowledges = [
    {
      id: "brain-1",
      title: "林动",
      description: "主角，坚韧。",
      category: "角色",
      categoryId: "cat-1",
      userId: "u1",
      createdAt: now,
      updatedAt: now,
    },
  ];
  const categories = [
    { id: "cat-1", name: "角色", color: "#fff", sortOrder: 0, userId: "u1", createdAt: now, updatedAt: now },
  ];
  const spreadsheets = [
    {
      id: "sheet-book-1",
      title: "角色成长表",
      data: {
        version: 1,
        activeSheetId: "sheet-1",
        sheets: [
          {
            id: "sheet-1",
            name: "角色",
            data: [
              ["角色", "境界", "进度"],
              ["林动", "元丹境", 88],
            ],
            cellStyles: [],
            merges: [],
            fixedRowsTop: 1,
            fixedColumnsLeft: 0,
            rowHeights: [],
            colWidths: [],
          },
        ],
      },
      preview: "角色 境界 进度 林动 元丹境 88",
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date("2026-07-08T01:30:00.000Z"),
      updatedAt: new Date("2026-07-08T05:30:00.000Z"),
      userId: "u1",
      groupId: null,
    },
  ];

  const matchesWhere = (item: any, where: any): boolean => {
    if (!where) return true;
    for (const [key, expected] of Object.entries(where)) {
      if (key === "OR") {
        if (!(expected as any[]).some((entry) => matchesWhere(item, entry))) return false;
      } else if (expected && typeof expected === "object" && "contains" in expected) {
        if (!String(item[key] || "").toLowerCase().includes(String((expected as any).contains).toLowerCase())) return false;
      } else if (expected && typeof expected === "object" && "in" in expected) {
        if (!(expected as any).in.includes(item[key])) return false;
      } else if (expected && typeof expected === "object" && ("gte" in expected || "lt" in expected)) {
        const value = item[key] instanceof Date ? item[key].getTime() : new Date(item[key]).getTime();
        if ((expected as any).gte && value < (expected as any).gte.getTime()) return false;
        if ((expected as any).lt && value >= (expected as any).lt.getTime()) return false;
      } else if (item[key] !== expected) {
        return false;
      }
    }
    return true;
  };
  const findMany = (items: any[]) => async (args: any = {}) => {
    const filtered = items.filter((item) => matchesWhere(item, args.where));
    return filtered.slice(0, args.take || filtered.length);
  };
  const count = (items: any[]) => async (args: any = {}) => items.filter((item) => matchesWhere(item, args.where)).length;

  return {
    prisma: {
      document: { findMany: findMany(documents), count: count(documents), findFirst: async (args: any) => documents.find((item) => matchesWhere(item, args.where)) || null },
      documentVersion: { findMany: findMany(versions) },
      documentGroup: { findMany: async () => [{ ...categories[0], documents: [documents[0]], name: "正文" }], count: async () => 1 },
      workRecord: { findMany: findMany(workRecords), count: count(workRecords) },
      spreadsheet: { findMany: findMany(spreadsheets), findFirst: async (args: any) => spreadsheets.find((item) => matchesWhere(item, args.where)) || null },
      aIBrainKnowledge: { findMany: findMany(knowledges), count: count(knowledges) },
      aIBrainCategory: { findMany: findMany(categories) },
    },
    ragService: {
      searchDocuments: async () => ({ degraded: false, results: [{ documentId: "doc-1", chunkIndex: 0, content: "林动 今天 练功", score: 0.91 }] }),
      searchKnowledge: async () => ({ degraded: true, error: "offline", results: [{ id: "brain-1", knowledgeId: "brain-1", title: "林动", description: "主角，坚韧。", category: "角色", score: 0 }] }),
    },
    now: () => now,
  };
}

describe("read-only AI chat tools", () => {
  it("answers document inventory, favorites, trash, versions, brain, records, and semantic tools", async () => {
    const deps = createMockDeps();
    const toolNames = [
      "list_documents",
      "list_favorite_documents",
      "list_trashed_documents",
      "get_document_summary",
      "search_documents",
      "list_spreadsheets",
      "get_spreadsheet_summary",
      "search_spreadsheets",
      "list_document_groups",
      "list_document_versions",
      "list_brain_knowledge",
      "search_brain_knowledge",
      "list_brain_categories",
      "list_work_records",
      "get_current_work_record",
      "get_writing_range_stats",
      "get_weekly_writing_stats",
      "search_document_semantic",
      "search_knowledge_semantic",
      "get_rag_status",
    ];

    for (const name of toolNames) {
      const result = await executeReadonlyChatTool(
        { name, arguments: JSON.stringify({ query: "林动", title: name.includes("spreadsheet") ? "角色成长表" : "第一章", period: "daily", targetDate: "2026-07-08" }) },
        { userId: "u1", userLang: "zh", deps }
      );
      assert.equal(result.status, "done", name);
      assert.ok(result.content.length > 0, name);
    }
  });

  it("rejects write tools without mutating data", async () => {
    const result = await executeReadonlyChatTool(
      { name: "create_document", arguments: "{}" },
      { userId: "u1", userLang: "zh", deps: createMockDeps() }
    );

    assert.equal(result.status, "error");
    assert.match(result.content, /只读/);
  });

  it("infers deterministic read-only tools for common user questions", () => {
    assert.deepEqual(inferReadonlyToolCalls("我有哪些收藏文章？").map((tool) => tool.name), ["list_favorite_documents"]);
    assert.deepEqual(inferReadonlyToolCalls("回收站里有什么？").map((tool) => tool.name), ["list_trashed_documents"]);
    assert.deepEqual(inferReadonlyToolCalls("脑库里有没有林动？").map((tool) => tool.name), ["search_brain_knowledge"]);
    assert.deepEqual(inferReadonlyToolCalls("这个文档有哪些历史版本？").map((tool) => tool.name), ["list_document_versions"]);
    assert.deepEqual(inferReadonlyToolCalls("这周每天写了多少字？").map((tool) => tool.name), ["get_writing_range_stats"]);
    assert.deepEqual(inferReadonlyToolCalls("帮我看看有哪些表格？").map((tool) => tool.name), ["list_spreadsheets"]);
    assert.deepEqual(inferReadonlyToolCalls("表格里有没有林动？").map((tool) => tool.name), ["search_spreadsheets"]);
  });
});
