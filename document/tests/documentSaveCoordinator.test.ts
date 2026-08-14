import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSerialDocumentSaveCoordinator } from "../src/lib/documentSaveCoordinator.ts";

describe("document save coordinator", () => {
  it("runs saves in request order and marks only the newest document save as latest", async () => {
    const coordinator = createSerialDocumentSaveCoordinator();
    const order: string[] = [];
    let releaseFirst: (() => void) | null = null;
    let markFirstStarted: (() => void) | null = null;
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const first = coordinator.enqueue("doc-1", async () => {
      order.push("first:start");
      markFirstStarted?.();
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push("first:end");
    });
    const second = coordinator.enqueue("doc-1", async () => {
      order.push("second");
    });

    await firstStarted;
    assert.deepEqual(order, ["first:start"]);
    releaseFirst?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.deepEqual(order, ["first:start", "first:end", "second"]);
    assert.equal(firstResult.isLatest, false);
    assert.equal(secondResult.isLatest, true);
  });

  it("continues with the next save after a failed request", async () => {
    const coordinator = createSerialDocumentSaveCoordinator();
    const failed = coordinator.enqueue("doc-1", async () => { throw new Error("offline"); });
    const recovered = coordinator.enqueue("doc-1", async () => {});

    assert.equal((await failed).success, false);
    assert.equal((await recovered).success, true);
  });
});
