import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDraftKey,
  buildImportPreview,
  buildIndexProgressLabel,
  buildSearchStatus,
  getFavoriteToggleKey,
  hasProfileChanges,
} from "../src/lib/interactionState";

describe("interaction state helpers", () => {
  it("describes document search results and empty search states", () => {
    const labels = {
      results: "找到 {count} 篇相关文档",
      empty: "没有找到相关文档",
      idle: "",
    };

    assert.equal(buildSearchStatus(3, "设定", labels), "找到 3 篇相关文档");
    assert.equal(buildSearchStatus(0, "设定", labels), "没有找到相关文档");
    assert.equal(buildSearchStatus(9, "", labels), "");
  });

  it("builds an import preview with estimated writing length", () => {
    const preview = buildImportPreview({
      fileName: "台风指南.md",
      extension: "md",
      content: "<h1>台风指南</h1><p>提前准备应急物资。</p>",
    });

    assert.equal(preview.title, "台风指南");
    assert.equal(preview.extension, "md");
    assert.equal(preview.wordCount, 12);
  });

  it("detects profile changes after trimming editable values", () => {
    assert.equal(hasProfileChanges(" 小安 ", "小安"), false);
    assert.equal(hasProfileChanges("小安 2", "小安"), true);
  });

  it("uses period and target date as stable journal draft identity", () => {
    assert.equal(buildDraftKey("weekly", "2026-07-08"), "znwriter_work_record_draft:weekly:2026-07-08");
  });

  it("formats index progress labels", () => {
    assert.equal(
      buildIndexProgressLabel("索引进度 {done}/{total}", 4, 9),
      "索引进度 4/9"
    );
  });

  it("uses the right favorite action label for document cards", () => {
    assert.equal(getFavoriteToggleKey(false), "editor.favorite");
    assert.equal(getFavoriteToggleKey(true), "editor.unfavorite");
  });
});
