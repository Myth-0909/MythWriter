import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSpreadsheetPreview,
  createDefaultSpreadsheetWorkbook,
  normalizeSpreadsheetWorkbook,
  validateSpreadsheetWorkbook,
} from "./spreadsheetWorkbook";

describe("server spreadsheet workbook helpers", () => {
  it("creates and validates a default workbook", () => {
    const workbook = createDefaultSpreadsheetWorkbook();

    assert.equal(workbook.version, 1);
    assert.equal(workbook.sheets.length, 1);
    assert.equal(workbook.activeSheetId, workbook.sheets[0].id);
    assert.equal(validateSpreadsheetWorkbook(workbook), true);
  });

  it("normalizes malformed workbook input to a safe default", () => {
    const workbook = normalizeSpreadsheetWorkbook({ version: 2, activeSheetId: "missing", sheets: [] });

    assert.equal(workbook.version, 1);
    assert.equal(workbook.sheets.length, 1);
    assert.equal(workbook.activeSheetId, workbook.sheets[0].id);
  });

  it("builds a compact preview from non-empty cell values", () => {
    const workbook = createDefaultSpreadsheetWorkbook();
    workbook.sheets[0].data = [
      ["Name", "Role"],
      ["Luo", "Archivist"],
    ];

    assert.equal(buildSpreadsheetPreview(workbook), "Name Role Luo Archivist");
  });
});
