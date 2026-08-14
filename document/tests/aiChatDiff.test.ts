import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDiffLines, htmlToPlainText, summarizeDiff } from "../src/lib/aiChatDiff.ts";

describe("ai chat diff helpers", () => {
  it("strips html tags into plain text with line breaks", () => {
    assert.equal(htmlToPlainText("<p>hello</p><p>world</p>"), "hello\nworld\n");
  });

  it("builds added/removed/unchanged rows", () => {
    const lines = buildDiffLines("a\nb\nc", "a\nx\nc");
    assert.deepEqual(
      lines.map((line) => `${line.type}:${line.text}`),
      ["unchanged:a", "removed:b", "added:x", "unchanged:c"]
    );
    assert.deepEqual(summarizeDiff(lines), { added: 1, removed: 1, unchanged: 2 });
  });
});
