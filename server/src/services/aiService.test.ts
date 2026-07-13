import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt, resolveAssistantActionReply } from "./aiService";

describe("ai assistant branding", () => {
  it("identifies the assistant as XiaoAn in the system prompt", () => {
    const prompt = buildSystemPrompt("normal", "");

    assert.match(prompt, /小安/);
    assert.match(prompt, /XiaoAn/);
    assert.doesNotMatch(prompt, /ZNWriter AI/);
    assert.doesNotMatch(prompt, /小麦|XiaoMai/);
  });

  it("includes current date and time context", () => {
    const prompt = buildSystemPrompt("normal", "");

    assert.match(prompt, /Current date and time:/);
    assert.match(prompt, /ISO 8601:/);
    assert.match(prompt, /Day of week:/);
  });

  it("extracts document creation actions from tool follow-up replies", () => {
    const rawReply = [
      "好的，我先查了最新信息。",
      '<<ACTION_JSON>>{"reply":"已为您生成文档「杭州周末台风防御指南」，请查看~","action":{"type":"create_document","title":"杭州周末台风防御指南","content":"# 杭州周末台风防御指南\\n\\n请关注预警并减少外出。"}}<<ACTION_JSON_END>>',
    ].join("\n\n");

    const parsed = resolveAssistantActionReply(rawReply);

    assert.equal(parsed.reply, "已为您生成文档「杭州周末台风防御指南」，请查看~");
    assert.deepEqual(parsed.action, {
      type: "create_document",
      title: "杭州周末台风防御指南",
      content: "# 杭州周末台风防御指南\n\n请关注预警并减少外出。",
    });
    assert.doesNotMatch(parsed.reply, /ACTION_JSON/);
  });

  it("does not instruct the model to use direct document write tools", () => {
    const prompt = buildSystemPrompt("normal", "");

    assert.match(prompt, /ACTION_JSON/);
    assert.doesNotMatch(prompt, /优先使用 create_document 函数工具/);
    assert.doesNotMatch(prompt, /优先使用 update_document 函数工具/);
  });

  it("asks normal chat replies to use safe HTML fragments without changing document action content", () => {
    const prompt = buildSystemPrompt("normal", "");

    assert.match(prompt, /安全 HTML 片段/);
    assert.match(prompt, /h2、h3、p、ul、ol、li、blockquote、strong、em、code、pre、table/);
    assert.match(prompt, /完整的 Markdown 格式文档内容/);
  });

  it("uses preview wording for document update actions", () => {
    const rawReply = [
      "<<ACTION_JSON>>",
      JSON.stringify({
        reply: "",
        action: {
          type: "update_document",
          docId: "15e429e0-6a61-4711-bee8-8fa688cdec67",
          content: "# 修改稿",
        },
      }),
      "<<ACTION_JSON_END>>",
    ].join("");

    const parsed = resolveAssistantActionReply(rawReply);

    assert.equal(parsed.reply, "已生成修改预览，请确认应用。");
    assert.deepEqual(parsed.action, {
      type: "update_document",
      docId: "15e429e0-6a61-4711-bee8-8fa688cdec67",
      content: "# 修改稿",
    });
  });

  it("teaches the model to inspect and patch spreadsheets through confirmed actions", () => {
    const prompt = buildSystemPrompt("normal", "");

    assert.match(prompt, /当前表格/);
    assert.match(prompt, /spreadsheet_patch/);
    assert.match(prompt, /set_cell/);
    assert.match(prompt, /append_row/);
    assert.match(prompt, /用户确认/);
  });

  it("extracts spreadsheet patch actions from structured replies", () => {
    const rawReply = [
      "<<ACTION_JSON>>",
      JSON.stringify({
        reply: "",
        action: {
          type: "spreadsheet_patch",
          spreadsheetId: "sheet-book-1",
          operations: [
            { type: "set_cell", sheetName: "角色", row: 1, col: 2, value: 90 },
            { type: "append_row", sheetName: "角色", values: ["绫清竹", "造化境", 72] },
          ],
        },
      }),
      "<<ACTION_JSON_END>>",
    ].join("");

    const parsed = resolveAssistantActionReply(rawReply);

    assert.equal(parsed.reply, "已生成表格修改预览，请确认应用。");
    assert.deepEqual(parsed.action, {
      type: "spreadsheet_patch",
      spreadsheetId: "sheet-book-1",
      operations: [
        { type: "set_cell", sheetName: "角色", row: 1, col: 2, value: 90 },
        { type: "append_row", sheetName: "角色", values: ["绫清竹", "造化境", 72] },
      ],
    });
  });
});
