import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRagService, formatBrainKnowledgeContext } from "./ragService";

function createDeps(overrides: Record<string, any> = {}) {
  const calls: Array<{ method: string; args: any[] }> = [];
  const record = (method: string, value: any) => async (...args: any[]) => {
    calls.push({ method, args });
    if (value instanceof Error) throw value;
    return typeof value === "function" ? value(...args) : value;
  };

  return {
    calls,
    deps: {
      generateEmbedding: record("generateEmbedding", [0.1, 0.2]),
      generateEmbeddings: record("generateEmbeddings", [[0.1, 0.2], [0.3, 0.4]]),
      searchKnowledge: record("searchKnowledge", [
        { id: "row-1", knowledgeId: "knowledge-1", title: "Alpha", description: "Lore", score: 0.81 },
      ]),
      searchDocuments: record("searchDocuments", [
        { id: "row-2", documentId: "doc-1", chunkIndex: 0, content: "Chunk", score: 0.74 },
      ]),
      insertKnowledge: record("insertKnowledge", undefined),
      insertDocumentChunks: record("insertDocumentChunks", undefined),
      deleteKnowledge: record("deleteKnowledge", undefined),
      deleteDocumentChunks: record("deleteDocumentChunks", undefined),
      chunkDocument: (html: string) => [
        { index: 0, content: html.slice(0, 5) },
        { index: 1, content: html.slice(5, 10) },
      ],
      ...overrides,
    },
  };
}

describe("rag service", () => {
  it("searches knowledge semantically", async () => {
    const { deps, calls } = createDeps();
    const rag = createRagService(deps);

    const result = await rag.searchKnowledge("user-1", "alpha query", 3);

    assert.equal(result.degraded, false);
    assert.equal(result.results[0].knowledgeId, "knowledge-1");
    assert.deepEqual(calls.map((call) => call.method), ["generateEmbedding", "searchKnowledge"]);
    assert.deepEqual(calls[0].args, ["alpha query", "user-1"]);
    assert.deepEqual(calls[1].args, ["user-1", [0.1, 0.2], 3]);
  });

  it("falls back to keyword matching when semantic knowledge search fails", async () => {
    const { deps } = createDeps({
      generateEmbedding: async () => {
        throw new Error("embedding offline");
      },
    });
    const rag = createRagService(deps);

    const result = await rag.searchKnowledge("user-1", "Tell me about Alpha", 5, async () => [
      { id: "knowledge-1", title: "Alpha", description: "Lore", category: "World" },
      { id: "knowledge-2", title: "Beta", description: "Other", category: "" },
    ]);

    assert.equal(result.degraded, true);
    assert.equal(result.results.length, 1);
    assert.deepEqual(result.results[0], {
      id: "knowledge-1",
      knowledgeId: "knowledge-1",
      title: "Alpha",
      description: "Lore",
      category: "World",
      score: 0,
    });
  });

  it("rebuilds a knowledge vector after generating the replacement vector", async () => {
    const { deps, calls } = createDeps();
    const rag = createRagService(deps);

    const result = await rag.reindexKnowledge({
      userId: "user-1",
      id: "knowledge-1",
      title: "Alpha",
      description: "Lore",
    });

    assert.deepEqual(result, { indexed: true });
    assert.deepEqual(calls.map((call) => call.method), ["generateEmbedding", "deleteKnowledge", "insertKnowledge"]);
    assert.deepEqual(calls[0].args, ["Alpha\n\nLore", "user-1"]);
    assert.deepEqual(calls[2].args, ["user-1", "knowledge-1", "Alpha", "Lore", [0.1, 0.2]]);
  });

  it("does not delete the old knowledge vector when embedding generation fails", async () => {
    const { deps, calls } = createDeps({
      generateEmbedding: async () => {
        throw new Error("embedding offline");
      },
    });
    const rag = createRagService(deps);

    const result = await rag.reindexKnowledge({
      userId: "user-1",
      id: "knowledge-1",
      title: "Alpha",
      description: "Lore",
    });

    assert.deepEqual(result, { indexed: false, error: "embedding offline" });
    assert.deepEqual(calls.map((call) => call.method), []);
  });

  it("rebuilds document chunk vectors from chunked content", async () => {
    const { deps, calls } = createDeps();
    const rag = createRagService(deps);

    const result = await rag.reindexDocument({
      userId: "user-1",
      id: "doc-1",
      content: "abcdefghij",
    });

    assert.deepEqual(result, { indexed: true, chunks: 2 });
    assert.deepEqual(calls.map((call) => call.method), [
      "generateEmbeddings",
      "deleteDocumentChunks",
      "insertDocumentChunks",
    ]);
    assert.deepEqual(calls[0].args, [["abcde", "fghij"], "user-1"]);
    assert.deepEqual(calls[2].args, [
      "user-1",
      "doc-1",
      [
        { index: 0, content: "abcde", vector: [0.1, 0.2] },
        { index: 1, content: "fghij", vector: [0.3, 0.4] },
      ],
    ]);
  });

  it("does not delete old document chunks when embedding generation fails", async () => {
    const { deps, calls } = createDeps({
      generateEmbeddings: async () => {
        throw new Error("embedding offline");
      },
    });
    const rag = createRagService(deps);

    const result = await rag.reindexDocument({
      userId: "user-1",
      id: "doc-1",
      content: "abcdefghij",
    });

    assert.deepEqual(result, { indexed: false, error: "embedding offline" });
    assert.deepEqual(calls.map((call) => call.method), []);
  });

  it("deletes stale document chunks when rebuilt content has no chunks", async () => {
    const { deps, calls } = createDeps({
      chunkDocument: () => [],
    });
    const rag = createRagService(deps);

    const result = await rag.reindexDocument({
      userId: "user-1",
      id: "doc-1",
      content: "",
    });

    assert.deepEqual(result, { indexed: true, chunks: 0 });
    assert.deepEqual(calls.map((call) => call.method), ["deleteDocumentChunks"]);
    assert.deepEqual(calls[0].args, ["doc-1"]);
  });

  it("deletes stale vectors through service helpers", async () => {
    const { deps, calls } = createDeps();
    const rag = createRagService(deps);

    assert.deepEqual(await rag.deleteKnowledgeVectors("knowledge-1"), { deleted: true });
    assert.deepEqual(await rag.deleteDocumentVectors("doc-1"), { deleted: true });

    assert.deepEqual(calls.map((call) => call.method), ["deleteKnowledge", "deleteDocumentChunks"]);
    assert.deepEqual(calls[0].args, ["knowledge-1"]);
    assert.deepEqual(calls[1].args, ["doc-1"]);
  });

  it("formats brain knowledge context with category labels", () => {
    const context = formatBrainKnowledgeContext([
      { title: "Alpha", description: "Lore", category: "World" },
    ]);

    assert.match(context, /关联背景设定库/);
    assert.match(context, /\* \[World\] Alpha: Lore/);
  });
});
