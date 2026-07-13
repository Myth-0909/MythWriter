import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSpreadsheetSelectionSummary } from "../src/lib/spreadsheetSelectionStats.ts";
import type { SpreadsheetSheet } from "../src/types.ts";

const sheet: SpreadsheetSheet = {
  id: "sheet-1",
  name: "Sheet 1",
  data: [
    ["名称", "分数", "进度"],
    ["林动", 88, "90"],
    ["绫清竹", 72, null],
  ],
  cellStyles: [],
  merges: [],
};

describe("spreadsheet selection status helpers", () => {
  it("summarizes selected cells with numeric aggregates", () => {
    const summary = buildSpreadsheetSelectionSummary(sheet, {
      startRow: 1,
      endRow: 2,
      startCol: 1,
      endCol: 2,
    });

    assert.deepEqual(summary, {
      rangeLabel: "B2:C3",
      cellCount: 4,
      numberCount: 3,
      sum: 250,
      average: 83.33333333333333,
      min: 72,
      max: 90,
    });
  });

  it("returns an empty numeric summary when no numbers are selected", () => {
    const summary = buildSpreadsheetSelectionSummary(sheet, {
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 0,
    });

    assert.equal(summary.rangeLabel, "A1");
    assert.equal(summary.cellCount, 1);
    assert.equal(summary.numberCount, 0);
    assert.equal(summary.sum, null);
    assert.equal(summary.average, null);
  });

  it("summarizes large selections without spreading every numeric value", () => {
    const largeSheet: SpreadsheetSheet = {
      id: "sheet-large",
      name: "Large Sheet",
      data: Array.from({ length: 200_000 }, (_, index) => [index + 1]),
      cellStyles: [],
      merges: [],
    };

    const summary = buildSpreadsheetSelectionSummary(largeSheet, {
      startRow: 0,
      endRow: 199_999,
      startCol: 0,
      endCol: 0,
    });

    assert.equal(summary.cellCount, 200_000);
    assert.equal(summary.numberCount, 200_000);
    assert.equal(summary.sum, 20_000_100_000);
    assert.equal(summary.average, 100_000.5);
    assert.equal(summary.min, 1);
    assert.equal(summary.max, 200_000);
  });
});
