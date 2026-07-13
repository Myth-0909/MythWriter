import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("spreadsheet toolbar feature coverage", () => {
  it("exposes core spreadsheet formatting and structure actions", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");
    const editorSource = readFileSync(new URL("../src/pages/SpreadsheetEditorPage.tsx", import.meta.url), "utf8");
    const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const i18nSource = readFileSync(new URL("../src/components/I18nProvider.tsx", import.meta.url), "utf8");

    for (const action of [
      "onToggleBold",
      "onToggleItalic",
      "onToggleUnderline",
      "onSetTextColor",
      "onSetFillColor",
      "onSetHorizontalAlign",
      "onToggleWrap",
      "onInsertRowAbove",
      "onInsertRowBelow",
      "onInsertColumnLeft",
      "onInsertColumnRight",
      "onDeleteSelectedRows",
      "onDeleteSelectedColumns",
      "onClearSelectedCells",
      "onSortAscending",
      "onSortDescending",
    ]) {
      assert.match(toolbarSource, new RegExp(action));
      assert.match(editorSource, new RegExp(action.replace(/^on/, "handle")));
    }

    for (const handle of [
      "applyCellStyle",
      "insertRowAbove",
      "insertRowBelow",
      "insertColumnLeft",
      "insertColumnRight",
      "deleteSelectedRows",
      "deleteSelectedColumns",
      "clearSelectedCells",
      "sortSelectedColumn",
    ]) {
      assert.match(gridSource, new RegExp(handle));
    }

    assert.match(typesSource, /export interface SpreadsheetCellStyle\b/);
    assert.match(typesSource, /cellStyles\?: SpreadsheetCellStyle\[\]/);
    assert.match(i18nSource, /"sheets\.insertRowAbove"/);
    assert.match(i18nSource, /"sheets\.clearCells"/);
  });
});
