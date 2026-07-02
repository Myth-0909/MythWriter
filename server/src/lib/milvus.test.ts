import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOCUMENT_CHUNKS_COLLECTION,
  KNOWLEDGE_COLLECTION,
  VECTOR_DIMENSION,
  createMilvusStore,
  getMilvusStatus,
  isMilvusSdkError,
  parseMilvusEndpoint,
} from "./milvus";

function createFakeClient() {
  const calls: Array<{ method: string; args: any }> = [];
  const client = {
    async hasCollection(args: any) {
      calls.push({ method: "hasCollection", args });
      return { value: false };
    },
    async createCollection(args: any) {
      calls.push({ method: "createCollection", args });
      return { error_code: "Success" };
    },
    async createIndex(args: any) {
      calls.push({ method: "createIndex", args });
      return { error_code: "Success" };
    },
    async loadCollection(args: any) {
      calls.push({ method: "loadCollection", args });
      return { error_code: "Success" };
    },
    async insert(args: any) {
      calls.push({ method: "insert", args });
      return { error_code: "Success" };
    },
    async deleteEntities(args: any) {
      calls.push({ method: "deleteEntities", args });
      return { error_code: "Success" };
    },
    async search(args: any) {
      calls.push({ method: "search", args });
      return {
        results: [
          {
            id: "row-1",
            score: 0.82,
            knowledge_id: "knowledge-1",
            document_id: "document-1",
            title: "Alpha",
            description: "Lore",
            chunk_index: 2,
            content: "Chunk text",
          },
        ],
      };
    },
  };

  return { client, calls };
}

describe("milvus store", () => {
  it("parses Milvus endpoints with or without a protocol", () => {
    assert.deepEqual(parseMilvusEndpoint("http://172.16.0.44:19530"), {
      host: "172.16.0.44",
      port: 19530,
    });
    assert.deepEqual(parseMilvusEndpoint("localhost"), {
      host: "localhost",
      port: 19530,
    });
    assert.deepEqual(parseMilvusEndpoint("milvus.local:19531"), {
      host: "milvus.local",
      port: 19531,
    });
  });

  it("classifies Milvus SDK errors without matching ordinary errors", () => {
    assert.equal(isMilvusSdkError(new Error("4 DEADLINE_EXCEEDED: Deadline exceeded")), true);
    assert.equal(isMilvusSdkError(Object.assign(new Error("boom"), { stack: "at @grpc/grpc-js/src/call.ts" })), true);
    assert.equal(isMilvusSdkError(new Error("ordinary application failure")), false);
  });

  it("reports Milvus as unavailable when startup checks fail", async () => {
    let initCalled = false;
    const result = await getMilvusStatus({
      checkReachable: async () => {
        throw new Error("network unreachable");
      },
      initCollections: async () => {
        initCalled = true;
      },
    });

    assert.deepEqual(result, {
      available: false,
      error: "network unreachable",
    });
    assert.equal(initCalled, false);
  });

  it("reports Milvus initialization failures without throwing", async () => {
    const result = await getMilvusStatus({
      initCollections: async () => {
        throw new Error("collection setup failed");
      },
    });

    assert.deepEqual(result, {
      available: false,
      error: "collection setup failed",
    });
  });

  it("creates and loads vector collections when they are missing", async () => {
    const { client, calls } = createFakeClient();
    const store = createMilvusStore(client);

    await store.initCollections();

    assert.deepEqual(
      calls.filter((call) => call.method === "hasCollection").map((call) => call.args.collection_name),
      [KNOWLEDGE_COLLECTION, DOCUMENT_CHUNKS_COLLECTION]
    );

    const createKnowledge = calls.find(
      (call) => call.method === "createCollection" && call.args.collection_name === KNOWLEDGE_COLLECTION
    );
    assert.ok(createKnowledge);
    assert.equal(createKnowledge.args.fields.find((field: any) => field.name === "vector").dim, VECTOR_DIMENSION);

    assert.deepEqual(
      calls.filter((call) => call.method === "loadCollection").map((call) => call.args.collection_name),
      [KNOWLEDGE_COLLECTION, DOCUMENT_CHUNKS_COLLECTION]
    );
  });

  it("inserts knowledge vectors and document chunk vectors", async () => {
    const { client, calls } = createFakeClient();
    const store = createMilvusStore(client);

    await store.insertKnowledge("user-1", "knowledge-1", "Title", "Desc", [0.1, 0.2]);
    await store.insertDocumentChunks("user-1", "doc-1", [
      { index: 0, content: "First", vector: [0.3, 0.4] },
      { index: 1, content: "Second", vector: [0.5, 0.6] },
    ]);

    assert.deepEqual(calls[0], {
      method: "insert",
      args: {
        collection_name: KNOWLEDGE_COLLECTION,
        data: [
          {
            id: "knowledge-1",
            user_id: "user-1",
            knowledge_id: "knowledge-1",
            title: "Title",
            description: "Desc",
            vector: [0.1, 0.2],
          },
        ],
      },
    });
    assert.equal(calls[1].args.collection_name, DOCUMENT_CHUNKS_COLLECTION);
    assert.equal(calls[1].args.data[1].id, "doc-1:1");
    assert.equal(calls[1].args.data[1].chunk_index, 1);
  });

  it("deletes vectors using escaped Milvus expressions", async () => {
    const { client, calls } = createFakeClient();
    const store = createMilvusStore(client);

    await store.deleteKnowledge("knowledge-\"quoted\"");
    await store.deleteDocumentChunks("doc-1");

    assert.equal(calls[0].args.expr, 'knowledge_id == "knowledge-\\"quoted\\""');
    assert.equal(calls[1].args.expr, 'document_id == "doc-1"');
  });

  it("searches user-scoped knowledge and document vectors", async () => {
    const { client, calls } = createFakeClient();
    const store = createMilvusStore(client);

    const knowledge = await store.searchKnowledge("user-1", [0.1, 0.2], 3);
    const documents = await store.searchDocuments("user-1", [0.1, 0.2], 4);

    assert.equal(calls[0].args.collection_name, KNOWLEDGE_COLLECTION);
    assert.equal(calls[0].args.filter, 'user_id == "user-1"');
    assert.equal(calls[0].args.limit, 3);
    assert.deepEqual(knowledge[0], {
      id: "row-1",
      knowledgeId: "knowledge-1",
      title: "Alpha",
      description: "Lore",
      score: 0.82,
    });

    assert.equal(calls[1].args.collection_name, DOCUMENT_CHUNKS_COLLECTION);
    assert.equal(calls[1].args.filter, 'user_id == "user-1"');
    assert.equal(calls[1].args.limit, 4);
    assert.deepEqual(documents[0], {
      id: "row-1",
      documentId: "document-1",
      chunkIndex: 2,
      content: "Chunk text",
      score: 0.82,
    });
  });
});
