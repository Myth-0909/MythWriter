import { ragService } from "./ragService";

type IndexDocument = { id: string; userId: string; content: string };
type IndexMutation =
  | { type: "reindex"; document: IndexDocument }
  | { type: "delete"; documentId: string };

type QueueEntry = {
  revision: number;
  latest: IndexMutation;
  timer: NodeJS.Timeout | null;
  running: boolean;
};

type IndexQueueDeps = {
  reindexDocument: typeof ragService.reindexDocument;
  deleteDocumentVectors: typeof ragService.deleteDocumentVectors;
  delayMs?: number;
  warn?: (message: string) => void;
};

export function createDocumentIndexQueue(deps: IndexQueueDeps) {
  const entries = new Map<string, QueueEntry>();
  const warnedAt = new Map<string, number>();
  const delayMs = deps.delayMs ?? 8_000;

  const warnOnce = (documentId: string, error: string) => {
    const key = `${documentId}:${error}`;
    const now = Date.now();
    if (now - (warnedAt.get(key) || 0) < 60_000) return;
    warnedAt.set(key, now);
    deps.warn?.(`[RAG] Document index ${documentId} failed: ${error}`);
  };

  const schedule = (documentId: string, entry: QueueEntry, delay = delayMs) => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void run(documentId, entry);
    }, delay);
    entry.timer.unref?.();
  };

  const run = async (documentId: string, entry: QueueEntry) => {
    if (entry.running) return;
    entry.running = true;
    const revision = entry.revision;
    const mutation = entry.latest;
    try {
      const result = mutation.type === "reindex"
        ? await deps.reindexDocument(mutation.document)
        : await deps.deleteDocumentVectors(mutation.documentId);
      if (("indexed" in result && !result.indexed) || ("deleted" in result && !result.deleted)) {
        warnOnce(documentId, result.error || "unknown error");
      }
    } finally {
      entry.running = false;
      if (entry.revision !== revision) {
        schedule(documentId, entry, 0);
      } else {
        entries.delete(documentId);
      }
    }
  };

  const enqueue = (documentId: string, mutation: IndexMutation, immediate = false) => {
    const existing = entries.get(documentId);
    const entry: QueueEntry = existing || {
      revision: 0,
      latest: mutation,
      timer: null,
      running: false,
    };
    entry.revision += 1;
    entry.latest = mutation;
    entries.set(documentId, entry);
    if (!entry.running) schedule(documentId, entry, immediate ? 0 : delayMs);
  };

  return {
    reindex(document: IndexDocument, options?: { immediate?: boolean }) {
      enqueue(document.id, { type: "reindex", document }, options?.immediate);
    },
    remove(documentId: string) {
      enqueue(documentId, { type: "delete", documentId }, true);
    },
    pendingCount() {
      return entries.size;
    },
  };
}

export const documentIndexQueue = createDocumentIndexQueue({
  reindexDocument: (document) => ragService.reindexDocument(document),
  deleteDocumentVectors: (documentId) => ragService.deleteDocumentVectors(documentId),
  warn: (message) => console.warn(message),
});
