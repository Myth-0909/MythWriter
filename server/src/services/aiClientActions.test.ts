import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_ACTION_TOOL_NAMES,
  parseClientActionFromToolCalls,
} from "./aiClientActions";

describe("AI client action tools", () => {
  it("exposes the expected client-side proposal tool names", () => {
    assert.deepEqual(
      [...CLIENT_ACTION_TOOL_NAMES].sort(),
      ["create_document", "patch_document", "spreadsheet_patch", "update_document"].sort()
    );
  });

  it("parses create_document tool calls into client actions", () => {
    const parsed = parseClientActionFromToolCalls([
      {
        name: "create_document",
        arguments: JSON.stringify({ title: "大纲", content: "# 标题\n正文" }),
      },
    ]);
    assert.deepEqual(parsed.action, {
      type: "create_document",
      title: "大纲",
      content: "# 标题\n正文",
    });
    assert.match(parsed.reply, /创建|Creating/i);
  });

  it("parses patch_document tool calls into client actions", () => {
    const parsed = parseClientActionFromToolCalls([
      {
        name: "patch_document",
        arguments: JSON.stringify({
          docId: "doc-1",
          operations: [
            { type: "replace_once", find: "旧句", replace: "新句" },
          ],
        }),
      },
    ]);
    assert.equal(parsed.action?.type, "patch_document");
    assert.equal(parsed.action?.docId, "doc-1");
    assert.equal(parsed.action?.operations?.length, 1);
  });

  it("ignores malformed or empty proposal tool calls", () => {
    const parsed = parseClientActionFromToolCalls([
      { name: "update_document", arguments: "{}" },
      { name: "search_web", arguments: JSON.stringify({ query: "x" }) },
    ]);
    assert.equal(parsed.action, null);
  });
});
