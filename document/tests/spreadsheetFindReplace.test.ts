import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findSpreadsheetMatches,
  replaceAllSpreadsheetMatches,
  replaceSpreadsheetMatch,
} from "../src/lib/spreadsheetFindReplace.ts";
import type { SpreadsheetSheet } from "../src/types.ts";

function sheet(): SpreadsheetSheet {
  return {
    id: "sheet-1",
    name: "Sheet 1",
    data: [
      ["角色", "境界", "备注"],
      ["林动", "元丹境", "林动进度"],
      ["绫清竹", "造化境", "待更新"],
    ],
    cellStyles: [],
    merges: [],
    rowHeights: [],
    colWidths: [],
  };
}

describe("spreadsheet find and replace helpers", () => {
  it("finds matching cells with spreadsheet addresses", () => {
    const matches = findSpreadsheetMatches(sheet(), "林动");

    assert.deepEqual(matches, [
      { row: 1, col: 0, cellLabel: "A2", value: "林动" },
      { row: 1, col: 2, cellLabel: "C2", value: "林动进度" },
    ]);
  });

  it("replaces one match without mutating the original sheet", () => {
    const original = sheet();
    const next = replaceSpreadsheetMatch(original, { row: 1, col: 2 }, "已完成");

    assert.equal(original.data[1][2], "林动进度");
    assert.equal(next.data[1][2], "已完成");
  });

  it("replaces all text matches and reports the changed cell count", () => {
    const result = replaceAllSpreadsheetMatches(sheet(), "境", "期");

    assert.equal(result.count, 3);
    assert.equal(result.sheet.data[0][1], "期界");
    assert.equal(result.sheet.data[1][1], "元丹期");
    assert.equal(result.sheet.data[2][1], "造化期");
  });
});
