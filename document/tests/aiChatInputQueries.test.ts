import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escapeRegExp,
  getBrainQuery,
  getMentionQuery,
  getSlashQuery,
  parseToolArguments,
} from "../src/lib/aiChatInputQueries.ts";

describe("ai chat input queries", () => {
  it("parses mention slash and brain queries at the end of input", () => {
    assert.deepEqual(getMentionQuery("hello @doc"), { query: "doc", start: 6 });
    assert.deepEqual(getSlashQuery("try /outline"), { query: "outline", start: 4 });
    assert.deepEqual(getBrainQuery("use #world"), { query: "world", start: 4 });
  });

  it("escapes regexp metacharacters and parses tool arguments safely", () => {
    assert.equal(escapeRegExp("a.b+c"), "a\\.b\\+c");
    assert.deepEqual(parseToolArguments('{"docId":"x"}'), { docId: "x" });
    assert.deepEqual(parseToolArguments("not-json"), {});
  });
});
