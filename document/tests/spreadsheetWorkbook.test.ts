import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addSpreadsheetSheet,
  buildSpreadsheetPreview,
  createDefaultWorkbook,
  createSpreadsheetSheet,
  deleteSpreadsheetSheet,
  renameSpreadsheetSheet,
  validateSpreadsheetWorkbook,
} from "../src/lib/spreadsheetWorkbook.ts";

describe("spreadsheet workbook helpers", () => {
  it("creates a valid default workbook with a first sheet", () => {
    const workbook = createDefaultWorkbook();

    assert.equal(workbook.version, 1);
    assert.equal(workbook.sheets.length, 1);
    assert.equal(workbook.activeSheetId, workbook.sheets[0].id);
    assert.equal(validateSpreadsheetWorkbook(workbook), true);
  });

  it("adds, renames, and deletes sheets without mutating the original workbook", () => {
    const workbook = createDefaultWorkbook();
    const withSecond = addSpreadsheetSheet(workbook, "Data");
    const secondSheet = withSecond.sheets[1];
    const renamed = renameSpreadsheetSheet(withSecond, secondSheet.id, "Budget");
    const deleted = deleteSpreadsheetSheet(renamed, secondSheet.id);

    assert.equal(workbook.sheets.length, 1);
    assert.equal(withSecond.sheets.length, 2);
    assert.equal(renamed.sheets[1].name, "Budget");
    assert.equal(deleted.sheets.length, 1);
    assert.equal(deleted.activeSheetId, deleted.sheets[0].id);
  });

  it("builds a compact preview from visible cell values", () => {
    const sheet = createSpreadsheetSheet("Outline");
    sheet.data = [
      ["Chapter", "Words"],
      ["Opening", 1200],
    ];
    const workbook = { version: 1 as const, activeSheetId: sheet.id, sheets: [sheet] };

    assert.equal(buildSpreadsheetPreview(workbook), "Chapter Words Opening 1200");
  });

  it("rejects malformed workbooks", () => {
    assert.equal(validateSpreadsheetWorkbook({ version: 1, sheets: [] }), false);
    assert.equal(validateSpreadsheetWorkbook({ version: 2, activeSheetId: "x", sheets: [] }), false);
    assert.equal(validateSpreadsheetWorkbook(null), false);
  });
});
