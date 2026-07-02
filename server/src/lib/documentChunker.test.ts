import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkDocument } from "./documentChunker";

describe("chunkDocument", () => {
  it("strips html and splits text into overlapping chunks", () => {
    const html = [
      "<h1>Alpha title</h1>",
      "<p>First paragraph has useful context for retrieval.</p>",
      "<script>ignored()</script>",
      "<p>Second paragraph continues the same document.</p>",
    ].join("");

    const chunks = chunkDocument(html, { chunkSize: 48, overlap: 12 });

    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks.map((chunk) => chunk.index), [0, 1, 2]);
    assert.ok(chunks[0].content.startsWith("Alpha title\nFirst paragraph"));
    assert.equal(chunks[1].content.slice(0, 12), chunks[0].content.slice(-12));
    assert.equal(chunks[2].content.slice(0, 12), chunks[1].content.slice(-12));
    assert.ok(chunks.every((chunk) => !chunk.content.includes("<")));
    assert.ok(chunks.every((chunk) => chunk.content.length <= 48));
  });

  it("returns no chunks for empty html", () => {
    assert.deepEqual(chunkDocument("<p>&nbsp;</p>"), []);
  });
});
