import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { applySpreadsheetCellChanges } from "../src/lib/spreadsheetPerformance.ts";
import type { SpreadsheetSheet } from "../src/types.ts";

function sheet(): SpreadsheetSheet {
  return {
    id: "sheet-1",
    name: "Data",
    data: [
      ["Name", "Score"],
      ["Lin", 88],
    ],
    cellStyles: [],
    merges: [],
    fixedRowsTop: 0,
    fixedColumnsLeft: 0,
    rowHeights: [],
    colWidths: [],
  };
}

describe("spreadsheet performance helpers", () => {
  it("applies Handsontable cell changes without cloning unchanged rows", () => {
    const original = sheet();
    const result = applySpreadsheetCellChanges(original, [
      [1, 1, 88, 90],
      [3, 2, null, "new"],
    ]);

    assert.equal(original.data.length, 2);
    assert.equal(result.changed, true);
    assert.equal(result.sheet.data[1][1], 90);
    assert.equal(result.sheet.data[3][2], "new");
    assert.notEqual(result.sheet.data, original.data);
    assert.notEqual(result.sheet.data[1], original.data[1]);
    assert.equal(result.sheet.data[0], original.data[0]);
  });

  it("keeps the hot edit path incremental and debounced at the source level", () => {
    const root = new URL("../", import.meta.url);
    const gridSource = readFileSync(new URL("src/components/spreadsheet/SpreadsheetGrid.tsx", root), "utf8");
    const editorSource = readFileSync(new URL("src/pages/SpreadsheetEditorPage.tsx", root), "utf8");

    assert.match(gridSource, /applySpreadsheetCellChanges/);
    assert.match(gridSource, /render:\s*false/);
    assert.doesNotMatch(gridSource, /afterChange=\{\(_changes: unknown, source: string\) => \{\s*if \(source === "loadData"\) return;\s*syncFromHot\(\);/s);
    assert.match(editorSource, /workbookRef/);
    assert.match(editorSource, /saveTimerRef/);
    assert.doesNotMatch(editorSource, /if \(!dirty \|\| !spreadsheet \|\| !workbook\) return;/);
  });
});
