import { chunkDocument } from "../lib/documentChunker";
import {
  generateEmbedding,
  generateEmbeddings,
  getUserEmbeddingConfig,
} from "../lib/embedding";
import {
  deleteDocumentChunks,
  deleteKnowledge,
  insertDocumentChunks,
  insertKnowledge,
  searchDocuments,
  searchKnowledge,
} from "../lib/milvus";

export const RAG_SCORE_THRESHOLD = 0.3;

export type KnowledgeLike = {
  id?: string;
  knowledgeId?: string;
  title: string;
  description: string;
  category?: string | null;
  score?: number;
};

export type RagSearchResult<T> = {
  results: T[];
  degraded: boolean;
  error?: string;
};

export type RagDependencies = {
  generateEmbedding: (text: string, userId: string) => Promise<number[]>;
  generateEmbeddings: (texts: string[], userId: string) => Promise<number[][]>;
  searchKnowledge: typeof searchKnowledge;
  searchDocuments: typeof searchDocuments;
  insertKnowledge: typeof insertKnowledge;
  insertDocumentChunks: typeof insertDocumentChunks;
  deleteKnowledge: typeof deleteKnowledge;
  deleteDocumentChunks: typeof deleteDocumentChunks;
  chunkDocument: typeof chunkDocument;
};

const defaultDependencies: RagDependencies = {
  async generateEmbedding(text, userId) {
    return generateEmbedding(text, await getUserEmbeddingConfig(userId));
  },
  async generateEmbeddings(texts, userId) {
    return generateEmbeddings(texts, await getUserEmbeddingConfig(userId));
  },
  searchKnowledge,
  searchDocuments,
  insertKnowledge,
  insertDocumentChunks,
  deleteKnowledge,
  deleteDocumentChunks,
  chunkDocument,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function keywordFallback(query: string, knowledges: KnowledgeLike[], topK: number): KnowledgeLike[] {
  const lowerQuery = query.toLowerCase();
  return knowledges
    .filter((knowledge) => lowerQuery.includes(knowledge.title.toLowerCase()))
    .slice(0, topK)
    .map((knowledge) => ({
      id: knowledge.id || knowledge.knowledgeId,
      knowledgeId: knowledge.knowledgeId || knowledge.id,
      title: knowledge.title,
      description: knowledge.description,
      category: knowledge.category || "",
      score: 0,
    }));
}

export function formatBrainKnowledgeContext(knowledges: KnowledgeLike[]): string {
  if (knowledges.length === 0) return "";

  return [
    "【关联背景设定库（请务必严格遵守以下设定，以保证故事前后逻辑连贯，切勿与这些设定相冲突）：】",
    ...knowledges.map((knowledge) => {
      const category = knowledge.category ? `[${knowledge.category}] ` : "";
      return `* ${category}${knowledge.title}: ${knowledge.description}`;
    }),
  ].join("\n");
}

export function createRagService(deps: RagDependencies = defaultDependencies) {
  return {
    async searchKnowledge(
      userId: string,
      query: string,
      topK = 5,
      fallbackLoader?: () => Promise<KnowledgeLike[]>
    ): Promise<RagSearchResult<KnowledgeLike>> {
      try {
        const queryVector = await deps.generateEmbedding(query, userId);
        const results = await deps.searchKnowledge(userId, queryVector, topK);
        return { results, degraded: false };
      } catch (error) {
        const fallback = fallbackLoader ? keywordFallback(query, await fallbackLoader(), topK) : [];
        return { results: fallback, degraded: true, error: errorMessage(error) };
      }
    },

    async searchDocuments(userId: string, query: string, topK = 5) {
      try {
        const queryVector = await deps.generateEmbedding(query, userId);
        const results = await deps.searchDocuments(userId, queryVector, topK);
        return { results, degraded: false };
      } catch (error) {
        return { results: [], degraded: true, error: errorMessage(error) };
      }
    },

    async reindexKnowledge(knowledge: {
      userId: string;
      id: string;
      title: string;
      description: string;
    }): Promise<{ indexed: boolean; error?: string }> {
      try {
        const vector = await deps.generateEmbedding(`${knowledge.title}\n\n${knowledge.description}`, knowledge.userId);
        await deps.deleteKnowledge(knowledge.id);
        await deps.insertKnowledge(
          knowledge.userId,
          knowledge.id,
          knowledge.title,
          knowledge.description,
          vector
        );
        return { indexed: true };
      } catch (error) {
        return { indexed: false, error: errorMessage(error) };
      }
    },

    async reindexDocument(document: {
      userId: string;
      id: string;
      content: string;
    }): Promise<{ indexed: boolean; chunks?: number; error?: string }> {
      try {
        const chunks = deps.chunkDocument(document.content);
        if (chunks.length === 0) {
          await deps.deleteDocumentChunks(document.id);
          return { indexed: true, chunks: 0 };
        }

        const vectors = await deps.generateEmbeddings(chunks.map((chunk) => chunk.content), document.userId);
        await deps.deleteDocumentChunks(document.id);
        await deps.insertDocumentChunks(
          document.userId,
          document.id,
          chunks.map((chunk, index) => ({
            index: chunk.index,
            content: chunk.content,
            vector: vectors[index],
          }))
        );
        return { indexed: true, chunks: chunks.length };
      } catch (error) {
        return { indexed: false, error: errorMessage(error) };
      }
    },

    async deleteKnowledgeVectors(knowledgeId: string): Promise<{ deleted: boolean; error?: string }> {
      try {
        await deps.deleteKnowledge(knowledgeId);
        return { deleted: true };
      } catch (error) {
        return { deleted: false, error: errorMessage(error) };
      }
    },

    async deleteDocumentVectors(documentId: string): Promise<{ deleted: boolean; error?: string }> {
      try {
        await deps.deleteDocumentChunks(documentId);
        return { deleted: true };
      } catch (error) {
        return { deleted: false, error: errorMessage(error) };
      }
    },
  };
}

export const ragService = createRagService();
