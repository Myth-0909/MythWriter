import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { packDocumentReferenceText } from "./aiReferencePacking";

describe("task-aware reference packing", () => {
  it("prefers the query-matching window over the document head", () => {
    const doc = [
      "前言很长很长很长".repeat(40),
      "",
      "台风防御重点：减少外出，关注预警。",
      "",
      "结尾很长很长很长".repeat(40),
    ].join("\n");

    const packed = packDocumentReferenceText(doc, "台风防御怎么办", { maxChars: 120 });
    assert.match(packed.text, /台风防御重点/);
    assert.ok(packed.text.length <= 120);
    assert.equal(packed.truncated, true);
  });

  it("falls back to head and tail when no query match exists", () => {
    const doc = `开头段落\n${"中部".repeat(200)}\n结尾段落`;
    const packed = packDocumentReferenceText(doc, "完全不相关的问题XYZ", { maxChars: 80 });
    assert.match(packed.text, /开头段落/);
    assert.match(packed.text, /结尾段落/);
    assert.equal(packed.truncated, true);
  });
});
