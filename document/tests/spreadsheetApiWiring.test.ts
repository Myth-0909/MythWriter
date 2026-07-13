import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("spreadsheet frontend API wiring", () => {
  it("declares spreadsheet types and API endpoints", () => {
    const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const apiSource = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8");

    assert.match(typesSource, /export interface Spreadsheet\b/);
    assert.match(typesSource, /export interface SpreadsheetWorkbook\b/);
    assert.match(apiSource, /listSpreadsheets:/);
    assert.match(apiSource, /getSpreadsheet:/);
    assert.match(apiSource, /createSpreadsheet:/);
    assert.match(apiSource, /updateSpreadsheet:/);
    assert.match(apiSource, /deleteSpreadsheet:/);
    assert.match(apiSource, /"\/spreadsheets"/);
  });
});
