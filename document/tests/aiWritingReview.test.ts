import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWritingReviewSnapshotCurrent } from "../src/lib/aiWritingReview.ts";

describe("AI writing review snapshots", () => {
  const current = {
    requestId: 2,
    latestRequestId: 2,
    targetDocumentId: "doc-1",
    currentDocumentId: "doc-1",
    targetContent: "<p>current</p>",
    currentContent: "<p>current</p>",
  };

  it("accepts only the latest result for unchanged content", () => {
    assert.equal(isWritingReviewSnapshotCurrent(current), true);
    assert.equal(isWritingReviewSnapshotCurrent({ ...current, latestRequestId: 3 }), false);
    assert.equal(isWritingReviewSnapshotCurrent({ ...current, currentDocumentId: "doc-2" }), false);
    assert.equal(isWritingReviewSnapshotCurrent({ ...current, currentContent: "<p>edited</p>" }), false);
  });
});
