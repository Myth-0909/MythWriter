import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLinkedTimeoutSignal } from "./abortSignal";

describe("createLinkedTimeoutSignal", () => {
  it("aborts when the parent signal aborts", () => {
    const parent = new AbortController();
    const linked = createLinkedTimeoutSignal(parent.signal, 1000);

    parent.abort();

    assert.equal(linked.signal.aborted, true);
    linked.cleanup();
  });

  it("aborts after the timeout", async () => {
    const parent = new AbortController();
    const linked = createLinkedTimeoutSignal(parent.signal, 5);

    await new Promise((resolve) => setTimeout(resolve, 15));

    assert.equal(linked.signal.aborted, true);
    linked.cleanup();
  });
});
