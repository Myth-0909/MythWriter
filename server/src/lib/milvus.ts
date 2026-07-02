import {
  DataType,
  IndexType,
  MetricType,
  MilvusClient,
} from "@zilliz/milvus2-sdk-node";

export const KNOWLEDGE_COLLECTION = "knowledge_vectors";
export const DOCUMENT_CHUNKS_COLLECTION = "document_chunks";
export const VECTOR_DIMENSION = Number(process.env.EMBEDDING_VECTOR_DIM || 8192);
export const DEFAULT_MILVUS_ADDRESS = process.env.MILVUS_ADDRESS || "http://172.16.0.44:19530";

type MilvusRow = Record<string, unknown>;

export type MilvusSearchKnowledgeResult = {
  id: string;
  knowledgeId: string;
  title: string;
  description: string;
  score: number;
};

export type MilvusSearchDocumentResult = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  score: number;
};

export type DocumentChunkVector = {
  index: number;
  content: string;
  vector: number[];
};

export type MilvusLikeClient = {
  hasCollection(args: { collection_name: string }): Promise<{ value?: boolean }>;
  createCollection(args: MilvusRow): Promise<unknown>;
  createIndex(args: MilvusRow): Promise<unknown>;
  loadCollection(args: { collection_name: string }): Promise<unknown>;
  insert(args: { collection_name: string; data: MilvusRow[] }): Promise<unknown>;
  deleteEntities(args: { collection_name: string; expr: string }): Promise<unknown>;
  search(args: MilvusRow): Promise<{ results?: MilvusRow[] }>;
};

export type MilvusStore = ReturnType<typeof createMilvusStore>;

function normalizeMilvusAddress(address: string): string {
  return address.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function quoteMilvusString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function ensureSuccess(response: unknown, action: string) {
  const status = (response as { status?: { error_code?: string | number; reason?: string }; error_code?: string | number; reason?: string }) || {};
  const errorCode = status.status?.error_code ?? status.error_code;
  const reason = status.status?.reason ?? status.reason ?? "";
  if (errorCode !== undefined && errorCode !== "Success" && errorCode !== 0) {
    throw new Error(`Milvus ${action} failed: ${String(errorCode)}${reason ? ` - ${reason}` : ""}`);
  }
}

function vectorIndex(collectionName: string) {
  return {
    collection_name: collectionName,
    field_name: "vector",
    index_type: IndexType.IVF_FLAT,
    metric_type: MetricType.COSINE,
    params: { nlist: 1024 },
  };
}

function knowledgeSchema() {
  return [
    { name: "id", data_type: DataType.VarChar, is_primary_key: true, max_length: 128 },
    { name: "user_id", data_type: DataType.VarChar, max_length: 128 },
    { name: "knowledge_id", data_type: DataType.VarChar, max_length: 128 },
    { name: "title", data_type: DataType.VarChar, max_length: 256 },
    { name: "description", data_type: DataType.VarChar, max_length: 1024 },
    { name: "vector", data_type: DataType.FloatVector, dim: VECTOR_DIMENSION },
  ];
}

function documentChunksSchema() {
  return [
    { name: "id", data_type: DataType.VarChar, is_primary_key: true, max_length: 160 },
    { name: "user_id", data_type: DataType.VarChar, max_length: 128 },
    { name: "document_id", data_type: DataType.VarChar, max_length: 128 },
    { name: "chunk_index", data_type: DataType.Int64 },
    { name: "content", data_type: DataType.VarChar, max_length: 1024 },
    { name: "vector", data_type: DataType.FloatVector, dim: VECTOR_DIMENSION },
  ];
}

async function ensureCollection(
  client: MilvusLikeClient,
  collectionName: string,
  fields: MilvusRow[]
) {
  const existing = await client.hasCollection({ collection_name: collectionName });
  if (!existing.value) {
    ensureSuccess(
      await client.createCollection({
        collection_name: collectionName,
        fields,
        enable_dynamic_field: false,
      }),
      `create collection ${collectionName}`
    );
    ensureSuccess(await client.createIndex(vectorIndex(collectionName)), `create index ${collectionName}`);
  }

  ensureSuccess(await client.loadCollection({ collection_name: collectionName }), `load collection ${collectionName}`);
}

function mapKnowledgeResult(row: MilvusRow): MilvusSearchKnowledgeResult {
  return {
    id: String(row.id || ""),
    knowledgeId: String(row.knowledge_id || ""),
    title: String(row.title || ""),
    description: String(row.description || ""),
    score: Number(row.score || 0),
  };
}

function mapDocumentResult(row: MilvusRow): MilvusSearchDocumentResult {
  return {
    id: String(row.id || ""),
    documentId: String(row.document_id || ""),
    chunkIndex: Number(row.chunk_index || 0),
    content: String(row.content || ""),
    score: Number(row.score || 0),
  };
}

export function createMilvusStore(client: MilvusLikeClient) {
  return {
    async initCollections() {
      await ensureCollection(client, KNOWLEDGE_COLLECTION, knowledgeSchema());
      await ensureCollection(client, DOCUMENT_CHUNKS_COLLECTION, documentChunksSchema());
    },

    async insertKnowledge(
      userId: string,
      knowledgeId: string,
      title: string,
      description: string,
      vector: number[]
    ) {
      ensureSuccess(
        await client.insert({
          collection_name: KNOWLEDGE_COLLECTION,
          data: [
            {
              id: truncate(knowledgeId, 128),
              user_id: truncate(userId, 128),
              knowledge_id: truncate(knowledgeId, 128),
              title: truncate(title, 256),
              description: truncate(description, 1024),
              vector,
            },
          ],
        }),
        "insert knowledge"
      );
    },

    async insertDocumentChunks(userId: string, documentId: string, chunks: DocumentChunkVector[]) {
      if (chunks.length === 0) return;

      ensureSuccess(
        await client.insert({
          collection_name: DOCUMENT_CHUNKS_COLLECTION,
          data: chunks.map((chunk) => ({
            id: truncate(`${documentId}:${chunk.index}`, 160),
            user_id: truncate(userId, 128),
            document_id: truncate(documentId, 128),
            chunk_index: chunk.index,
            content: truncate(chunk.content, 1024),
            vector: chunk.vector,
          })),
        }),
        "insert document chunks"
      );
    },

    async deleteKnowledge(knowledgeId: string) {
      ensureSuccess(
        await client.deleteEntities({
          collection_name: KNOWLEDGE_COLLECTION,
          expr: `knowledge_id == ${quoteMilvusString(knowledgeId)}`,
        }),
        "delete knowledge"
      );
    },

    async deleteDocumentChunks(documentId: string) {
      ensureSuccess(
        await client.deleteEntities({
          collection_name: DOCUMENT_CHUNKS_COLLECTION,
          expr: `document_id == ${quoteMilvusString(documentId)}`,
        }),
        "delete document chunks"
      );
    },

    async searchKnowledge(userId: string, queryVector: number[], topK = 5): Promise<MilvusSearchKnowledgeResult[]> {
      const response = await client.search({
        collection_name: KNOWLEDGE_COLLECTION,
        vector: queryVector,
        anns_field: "vector",
        filter: `user_id == ${quoteMilvusString(userId)}`,
        limit: topK,
        output_fields: ["knowledge_id", "title", "description"],
        metric_type: MetricType.COSINE,
        params: { nprobe: 16 },
      });
      return (response.results || []).map(mapKnowledgeResult);
    },

    async searchDocuments(userId: string, queryVector: number[], topK = 5): Promise<MilvusSearchDocumentResult[]> {
      const response = await client.search({
        collection_name: DOCUMENT_CHUNKS_COLLECTION,
        vector: queryVector,
        anns_field: "vector",
        filter: `user_id == ${quoteMilvusString(userId)}`,
        limit: topK,
        output_fields: ["document_id", "chunk_index", "content"],
        metric_type: MetricType.COSINE,
        params: { nprobe: 16 },
      });
      return (response.results || []).map(mapDocumentResult);
    },
  };
}

let defaultStore: MilvusStore | null = null;

function getDefaultStore(): MilvusStore {
  if (!defaultStore) {
    const client = new MilvusClient({
      address: normalizeMilvusAddress(DEFAULT_MILVUS_ADDRESS),
      timeout: Number(process.env.MILVUS_TIMEOUT_MS || 3000),
    }) as unknown as MilvusLikeClient;
    defaultStore = createMilvusStore(client);
  }
  return defaultStore;
}

export async function initCollections() {
  return getDefaultStore().initCollections();
}

export async function insertKnowledge(
  userId: string,
  knowledgeId: string,
  title: string,
  description: string,
  vector: number[]
) {
  return getDefaultStore().insertKnowledge(userId, knowledgeId, title, description, vector);
}

export async function insertDocumentChunks(userId: string, documentId: string, chunks: DocumentChunkVector[]) {
  return getDefaultStore().insertDocumentChunks(userId, documentId, chunks);
}

export async function deleteKnowledge(knowledgeId: string) {
  return getDefaultStore().deleteKnowledge(knowledgeId);
}

export async function deleteDocumentChunks(documentId: string) {
  return getDefaultStore().deleteDocumentChunks(documentId);
}

export async function searchKnowledge(userId: string, queryVector: number[], topK = 5) {
  return getDefaultStore().searchKnowledge(userId, queryVector, topK);
}

export async function searchDocuments(userId: string, queryVector: number[], topK = 5) {
  return getDefaultStore().searchDocuments(userId, queryVector, topK);
}

export async function getMilvusStatus(): Promise<{ available: boolean; error?: string }> {
  try {
    await initCollections();
    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
