import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDocumentIndexQueue } from "./documentIndexQueue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

describe("document index queue", () => {
  it("coalesces rapid edits and indexes only the latest content", async () => {
    const indexed: string[] = [];
    const queue = createDocumentIndexQueue({
      delayMs: 1,
      reindexDocument: async (document) => {
        indexed.push(document.content);
        return { indexed: true, chunks: 1 };
      },
      deleteDocumentVectors: async () => ({ deleted: true }),
    });

    queue.reindex({ id: "doc-1", userId: "user-1", content: "first" });
    queue.reindex({ id: "doc-1", userId: "user-1", content: "latest" });
    await tick();

    assert.deepEqual(indexed, ["latest"]);
    assert.equal(queue.pendingCount(), 0);
  });

  it("serializes an edit that arrives while indexing", async () => {
    const indexed: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const queue = createDocumentIndexQueue({
      delayMs: 0,
      reindexDocument: async (document) => {
        indexed.push(document.content);
        if (document.content === "first") await firstBlocked;
        return { indexed: true, chunks: 1 };
      },
      deleteDocumentVectors: async () => ({ deleted: true }),
    });

    queue.reindex({ id: "doc-1", userId: "user-1", content: "first" }, { immediate: true });
    await tick();
    queue.reindex({ id: "doc-1", userId: "user-1", content: "latest" }, { immediate: true });
    releaseFirst?.();
    await tick();
    await tick();

    assert.deepEqual(indexed, ["first", "latest"]);
    assert.equal(queue.pendingCount(), 0);
  });

  it("lets a delete supersede a pending reindex", async () => {
    const actions: string[] = [];
    const queue = createDocumentIndexQueue({
      delayMs: 20,
      reindexDocument: async () => {
        actions.push("reindex");
        return { indexed: true, chunks: 1 };
      },
      deleteDocumentVectors: async () => {
        actions.push("delete");
        return { deleted: true };
      },
    });

    queue.reindex({ id: "doc-1", userId: "user-1", content: "draft" });
    queue.remove("doc-1");
    await tick();

    assert.deepEqual(actions, ["delete"]);
  });
});
