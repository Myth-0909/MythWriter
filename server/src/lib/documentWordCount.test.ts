import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countDocumentWords } from "./documentWordCount";

describe("document word count", () => {
  it("counts CJK characters and western words using the editor definition", () => {
    assert.equal(countDocumentWords("<p>你好 世界</p>"), 4);
    assert.equal(countDocumentWords("<div>hello&nbsp;world</div>"), 2);
    assert.equal(countDocumentWords("<p>你好 Myth Writer 2026</p>"), 5);
  });

  it("returns 0 for empty or nullish content", () => {
    assert.equal(countDocumentWords(""), 0);
    assert.equal(countDocumentWords(null), 0);
    assert.equal(countDocumentWords(undefined), 0);
  });

  it("ignores script/style blocks", () => {
    assert.equal(
      countDocumentWords("<style>.x{}</style><p>正文</p><script>alert(1)</script>"),
      2
    );
  });
});
