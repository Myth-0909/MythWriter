import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSpreadsheetSheet } from "../src/lib/spreadsheetWorkbook.ts";
import {
  workbookFromCsvText,
  workbookFromXlsxArrayBuffer,
  workbookToCsvText,
  workbookToXlsxBlob,
} from "../src/lib/spreadsheetImportExport.ts";

describe("spreadsheet xlsx import/export helpers", () => {
  it("round-trips workbook cell values through xlsx", async () => {
    const sheet = createSpreadsheetSheet("Cast");
    sheet.data = [
      ["Name", "Power"],
      ["Ari", 42],
    ];
    const workbook = { version: 1 as const, activeSheetId: sheet.id, sheets: [sheet] };

    const blob = workbookToXlsxBlob(workbook);
    const parsed = workbookFromXlsxArrayBuffer(await blob.arrayBuffer());

    assert.equal(parsed.sheets.length, 1);
    assert.equal(parsed.sheets[0].name, "Cast");
    assert.equal(parsed.sheets[0].data[0][0], "Name");
    assert.equal(parsed.sheets[0].data[1][1], "42");
  });

  it("round-trips the active sheet through csv with escaped values", () => {
    const sheet = createSpreadsheetSheet("CSV");
    sheet.data = [
      ["Name", "Note"],
      ["Ari", "has, comma"],
      ["Bo", "line\nbreak"],
    ];
    const workbook = { version: 1 as const, activeSheetId: sheet.id, sheets: [sheet] };

    const csv = workbookToCsvText(workbook);
    const parsed = workbookFromCsvText(csv, "Imported CSV");

    assert.match(csv, /"has, comma"/);
    assert.match(csv, /"line\nbreak"/);
    assert.equal(parsed.sheets[0].name, "Imported CSV");
    assert.deepEqual(parsed.sheets[0].data, sheet.data);
  });
});
