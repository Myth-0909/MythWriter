import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildToolMemoryContent,
  resolveActionDisplayContent,
  resolveActionFailureContent,
  resolveActionSuccessContent,
} from "../src/lib/aiActionState.ts";

describe("AI action state helpers", () => {
  const labels = {
    createPending: "正在创建文档「{title}」...",
    createSuccess: "已创建文档「{title}」，请查看。",
    createFailed: "文档创建失败，未产生新文档。",
    updatePreview: "已生成修改预览，请确认应用。",
    genericFailure: "操作失败，未产生任何数据变更。",
  };

  it("does not show create-document success before the document is verified", () => {
    const content = resolveActionDisplayContent(
      { type: "create_document", title: "台风指南", content: "# 台风指南" },
      "已为您生成文档「台风指南」，请查看~",
      labels
    );

    assert.equal(content, "正在创建文档「台风指南」...");
  });

  it("uses preview wording for document updates instead of completed wording", () => {
    const content = resolveActionDisplayContent(
      { type: "update_document", docId: "doc-1", content: "# 新稿" },
      "已为您完成修改，请查看文档~",
      labels
    );

    assert.equal(content, "已生成修改预览，请确认应用。");
  });

  it("formats verified action success and failure messages", () => {
    assert.equal(
      resolveActionSuccessContent({ type: "create_document", title: "台风指南" }, labels),
      "已创建文档「台风指南」，请查看。"
    );
    assert.equal(
      resolveActionFailureContent({ type: "create_document", title: "台风指南" }, labels),
      "文档创建失败，未产生新文档。"
    );
  });

  it("stores full tool evidence in memory instead of only compact result text", () => {
    const content = buildToolMemoryContent({
      result: "杭州 台风",
      summary: "搜索到 5 条结果",
      content: "Web search results for \"杭州 台风\":\n1. 最新预警\n2. 交通调整",
    });

    assert.match(content, /最新预警/);
    assert.match(content, /交通调整/);
  });
});
