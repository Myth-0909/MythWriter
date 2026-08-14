import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectReferencedBrainIds } from "./aiReferences";

describe("AI chat references", () => {
  it("keeps manual brain references and filters automatic references by score", () => {
    const ids = selectReferencedBrainIds([
      { type: "document", id: "doc-1" },
      { type: "brain", id: "manual-low", score: 0.01 },
      { type: "brain", id: "auto-low", auto: true, score: 0.3 },
      { type: "brain", id: "auto-missing", auto: true },
      { type: "brain", id: "auto-high", auto: true, score: 0.31 },
      { type: "brain", id: "auto-string-high", auto: "true", score: "0.9" },
    ]);

    assert.deepEqual(ids, ["manual-low", "auto-high", "auto-string-high"]);
  });

  it("deduplicates brain references while preserving request order", () => {
    const ids = selectReferencedBrainIds([
      { type: "brain", id: "alpha" },
      { type: "brain", id: "beta", auto: true, score: 0.8 },
      { type: "brain", id: "alpha", auto: true, score: 0.9 },
      { type: "brain", id: "beta" },
    ]);

    assert.deepEqual(ids, ["alpha", "beta"]);
  });

  it("bounds reference count and identifier length before database queries", () => {
    const ids = selectReferencedBrainIds(Array.from({ length: 20 }, (_, index) => ({
      type: "brain",
      id: `${index}-${"x".repeat(200)}`,
    })));

    assert.equal(ids.length, 12);
    assert.ok(ids.every((id) => id.length <= 128));
  });
});
