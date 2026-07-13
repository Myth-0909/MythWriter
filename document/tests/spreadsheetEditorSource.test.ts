import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("spreadsheet editor source wiring", () => {
  it("uses dedicated spreadsheet toolbar, sheet tabs, and Handsontable grid", () => {
    const root = new URL("../", import.meta.url);
    const editorSource = readFileSync(new URL("src/pages/SpreadsheetEditorPage.tsx", root), "utf8");
    const gridPath = resolve(new URL("src/components/spreadsheet/SpreadsheetGrid.tsx", root).pathname);
    const toolbarPath = resolve(new URL("src/components/spreadsheet/SpreadsheetToolbar.tsx", root).pathname);
    const tabsPath = resolve(new URL("src/components/spreadsheet/SheetTabs.tsx", root).pathname);

    assert.equal(existsSync(gridPath), true);
    assert.equal(existsSync(toolbarPath), true);
    assert.equal(existsSync(tabsPath), true);
    assert.match(editorSource, /SpreadsheetToolbar/);
    assert.match(editorSource, /SpreadsheetGrid/);
    assert.match(editorSource, /SheetTabs/);
  });
});
