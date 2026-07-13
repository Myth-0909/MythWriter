import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySpreadsheetPatch } from "../src/lib/spreadsheetAiPatch.ts";
import type { SpreadsheetWorkbook } from "../src/types.ts";

function workbook(): SpreadsheetWorkbook {
  return {
    version: 1,
    activeSheetId: "sheet-1",
    sheets: [
      {
        id: "sheet-1",
        name: "角色",
        data: [
          ["角色", "境界", "进度"],
          ["林动", "元丹境", 88],
        ],
        cellStyles: [],
        merges: [],
        fixedRowsTop: 1,
        fixedColumnsLeft: 0,
        rowHeights: [],
        colWidths: [],
      },
    ],
  };
}

describe("AI spreadsheet patch helper", () => {
  it("applies cell edits, appended rows, and sheet renames without mutating the original workbook", () => {
    const original = workbook();

    const result = applySpreadsheetPatch(original, {
      operations: [
        { type: "set_cell", sheetName: "角色", row: 1, col: 2, value: 90 },
        { type: "append_row", sheetName: "角色", values: ["绫清竹", "造化境", 72] },
        { type: "rename_sheet", sheetName: "角色", name: "角色进度" },
      ],
    });

    assert.equal(original.sheets[0].data[1][2], 88);
    assert.equal(result.workbook.sheets[0].name, "角色进度");
    assert.equal(result.workbook.sheets[0].data[1][2], 90);
    assert.deepEqual(result.workbook.sheets[0].data[2], ["绫清竹", "造化境", 72]);
    assert.equal(result.appliedCount, 3);
    assert.match(result.summary, /角色/);
  });
});
