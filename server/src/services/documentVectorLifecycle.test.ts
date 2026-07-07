import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentVectorActionForMutation } from "./documentVectorLifecycle";

describe("document vector lifecycle", () => {
  it("does not touch document vectors when only favorite state changes", () => {
    assert.equal(documentVectorActionForMutation("favorite"), "none");
  });

  it("removes vectors when a document leaves the searchable library", () => {
    assert.equal(documentVectorActionForMutation("trash"), "delete");
    assert.equal(documentVectorActionForMutation("delete"), "delete");
    assert.equal(documentVectorActionForMutation("emptyTrash"), "delete");
  });

  it("reindexes vectors when searchable document content becomes available", () => {
    assert.equal(documentVectorActionForMutation("create"), "reindex");
    assert.equal(documentVectorActionForMutation("contentUpdate"), "reindex");
    assert.equal(documentVectorActionForMutation("restore"), "reindex");
    assert.equal(documentVectorActionForMutation("versionRestore"), "reindex");
  });
});
