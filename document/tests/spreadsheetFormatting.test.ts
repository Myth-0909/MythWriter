import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSpreadsheetCellDisplay } from "../src/lib/spreadsheetFormatting.ts";

describe("spreadsheet formatting helpers", () => {
  it("formats numeric cells for common spreadsheet formats", () => {
    assert.equal(formatSpreadsheetCellDisplay(1234.5, "number"), "1,234.50");
    assert.equal(formatSpreadsheetCellDisplay(1234.5, "currency"), "¥1,234.50");
    assert.equal(formatSpreadsheetCellDisplay(0.256, "percent"), "25.60%");
  });

  it("formats date cells without changing blank values", () => {
    assert.equal(formatSpreadsheetCellDisplay("2026-07-13", "date"), "2026-07-13");
    assert.equal(formatSpreadsheetCellDisplay(null, "currency"), "");
  });
});
