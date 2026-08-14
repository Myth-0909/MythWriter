import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDocumentPatches,
  applyDocumentPatchesPreferHtml,
} from "../src/lib/documentAiPatch.ts";

describe("document AI patches", () => {
  it("applies replace_once and replace_all operations", () => {
    const result = applyDocumentPatches("苹果 苹果 香蕉", [
      { type: "replace_once", find: "苹果", replace: "梨" },
      { type: "replace_all", find: "香蕉", replace: "葡萄" },
    ]);
    assert.equal(result.content, "梨 苹果 葡萄");
    assert.equal(result.applied, 2);
    assert.equal(result.errors.length, 0);
  });

  it("reports missing find text without mutating later successful ops", () => {
    const result = applyDocumentPatches("hello world", [
      { type: "replace_once", find: "missing", replace: "x" },
      { type: "replace_once", find: "world", replace: "there" },
    ]);
    assert.equal(result.content, "hello there");
    assert.equal(result.applied, 1);
    assert.equal(result.errors.length, 1);
  });

  it("rejects empty find strings", () => {
    const result = applyDocumentPatches("abc", [
      { type: "replace_all", find: "  ", replace: "x" },
    ]);
    assert.equal(result.content, "abc");
    assert.equal(result.applied, 0);
    assert.ok(result.errors.length > 0);
  });

  it("matches find text with flexible whitespace", () => {
    const result = applyDocumentPatches("hello   world\nagain", [
      { type: "replace_once", find: "hello world", replace: "hi there" },
    ]);
    assert.equal(result.content, "hi there\nagain");
    assert.equal(result.applied, 1);
  });

  it("preserves html tags when replacing visible text", () => {
    const result = applyDocumentPatchesPreferHtml(
      "<p>Hello <strong>world</strong></p>",
      [{ type: "replace_once", find: "Hello world", replace: "Hi earth" }]
    );
    assert.equal(result.applied, 1);
    assert.match(result.html, /Hi earth/);
    assert.match(result.html, /<strong>/);
    assert.match(result.html, /<\/strong>/);
  });

  it("does not corrupt html attributes with short find tokens", () => {
    const result = applyDocumentPatchesPreferHtml(
      '<p class="note">class meeting notes</p>',
      [{ type: "replace_once", find: "class", replace: "team" }]
    );
    assert.equal(result.applied, 1);
    assert.match(result.html, /class="note"/);
    assert.match(result.html, /team meeting notes/);
  });

  it("escapes AI replacement markup before inserting it into document HTML", () => {
    const result = applyDocumentPatchesPreferHtml(
      "<p>安全文本</p>",
      [{ type: "replace_once", find: "安全文本", replace: '<img src=x onerror="alert(1)">' }]
    );
    assert.equal(result.applied, 1);
    assert.doesNotMatch(result.html, /<img/i);
    assert.match(result.html, /&lt;img src=x onerror="alert\(1\)"&gt;/);
  });

});
