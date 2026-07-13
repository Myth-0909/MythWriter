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

  it("applies sheet, row, column, and range structure operations for AI edits", () => {
    const original = workbook();

    const result = applySpreadsheetPatch(original, {
      operations: [
        { type: "create_sheet", name: "道具", data: [["名称", "等级"], ["祖石", "神物"]] },
        { type: "insert_rows", sheetName: "角色", index: 1, values: [["小貂", "涅槃境", 66], ["临时", "待删", 0]] },
        { type: "insert_columns", sheetName: "角色", index: 1, values: [["来源"], ["妖灵"], ["临时"], ["大炎"]] },
        { type: "clear_range", sheetName: "角色", startRow: 3, startCol: 3, endRow: 3, endCol: 3 },
        { type: "delete_rows", sheetName: "角色", index: 2, count: 1 },
        { type: "delete_columns", sheetName: "角色", index: 1, count: 1 },
        { type: "delete_sheet", sheetName: "道具" },
      ],
    });

    assert.equal(original.sheets.length, 1);
    assert.equal(original.sheets[0].data[1][2], 88);
    assert.equal(result.workbook.sheets.length, 1);
    assert.deepEqual(result.workbook.sheets[0].data[1], ["小貂", "涅槃境", 66]);
    assert.deepEqual(result.workbook.sheets[0].data[2], ["林动", "元丹境", null]);
    assert.equal(result.appliedCount, 7);
    assert.match(result.summary, /道具/);
    assert.match(result.summary, /角色/);
  });

  it("does not count out-of-range destructive operations as applied", () => {
    const result = applySpreadsheetPatch(workbook(), {
      operations: [
        { type: "delete_rows", sheetName: "角色", index: 20, count: 1 },
        { type: "delete_columns", sheetName: "角色", index: 20, count: 1 },
        { type: "delete_sheet", sheetName: "角色" },
      ],
    });

    assert.equal(result.appliedCount, 0);
    assert.equal(result.summary, "");
    assert.deepEqual(result.workbook.sheets[0].data, workbook().sheets[0].data);
  });
});
