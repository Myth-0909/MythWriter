import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSelectionEditContextCurrent,
  isSelectionSnapshotCurrent,
  plainTextToEditorHtml,
} from "../src/lib/aiSelectionEdit.ts";

describe("AI selection edit safety", () => {
  it("rejects a stale selection snapshot", () => {
    assert.equal(isSelectionSnapshotCurrent("原文", "原文"), true);
    assert.equal(isSelectionSnapshotCurrent("用户刚刚改过的内容", "原文"), false);
  });

  it("rejects selection edits after the range or document changes", () => {
    const base = {
      expectedDocumentId: "doc-1",
      currentDocumentId: "doc-1",
      expectedFrom: 2,
      expectedTo: 6,
      currentFrom: 2,
      currentTo: 6,
      originalText: "原文",
      currentText: "原文",
    };
    assert.equal(isSelectionEditContextCurrent(base), true);
    assert.equal(isSelectionEditContextCurrent({ ...base, currentDocumentId: "doc-2" }), false);
    assert.equal(isSelectionEditContextCurrent({ ...base, currentFrom: 3 }), false);
  });

  it("converts model output to safe editor HTML", () => {
    const html = plainTextToEditorHtml("第一行\n<img src=x onerror=alert(1)>");
    assert.equal(html, "第一行<br>&lt;img src=x onerror=alert(1)&gt;");
  });
});
