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

  it("keeps spreadsheet selection when toolbar controls are clicked and animates tooltips", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");
    const tooltipSource = readFileSync(new URL("../src/components/ui/tooltip.tsx", import.meta.url), "utf8");
    const appCss = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

    assert.match(toolbarSource, /function preserveSpreadsheetSelection/);
    assert.match(toolbarSource, /onMouseDown=\{preserveSpreadsheetSelection\}/);
    assert.match(gridSource, /lastSelectionRef/);
    assert.match(gridSource, /afterSelectionEnd/);
    assert.match(tooltipSource, /zn-tooltip-content/);
    assert.match(tooltipSource, /delay = 120/);
    assert.match(appCss, /@keyframes znTooltipIn/);
    assert.match(appCss, /\.zn-tooltip-content\[data-state="delayed-open"\]/);
  });

  it("separates spreadsheet action buttons from editing tools and highlights saved status", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");
    const editorSource = readFileSync(new URL("../src/pages/SpreadsheetEditorPage.tsx", import.meta.url), "utf8");

    assert.doesNotMatch(toolbarSource, /sheets\.saveNow/);
    assert.doesNotMatch(editorSource, /canSave=\{/);
    assert.match(toolbarSource, /data-spreadsheet-action-bar/);
    assert.match(toolbarSource, /data-spreadsheet-editing-bar/);
    assert.match(toolbarSource, /status === "saved"/);
    assert.match(toolbarSource, /text-emerald-600/);
  });

  it("localizes Handsontable built-in row and column menus with the app language", () => {
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");

    assert.match(gridSource, /registerLanguageDictionary/);
    assert.match(gridSource, /zhCN/);
    assert.match(gridSource, /enUS/);
    assert.match(gridSource, /const \{ lang \} = useI18n\(\)/);
    assert.match(gridSource, /language=\{lang === "zh" \? "zh-CN" : "en-US"\}/);
  });

  it("synchronizes Handsontable context-menu edits into workbook state", () => {
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");
    const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const workbookSource = readFileSync(new URL("../src/lib/spreadsheetWorkbook.ts", import.meta.url), "utf8");
    const serverWorkbookSource = readFileSync(new URL("../../server/src/services/spreadsheetWorkbook.ts", import.meta.url), "utf8");
    const spreadsheetCss = readFileSync(new URL("../src/components/spreadsheet/spreadsheet.css", import.meta.url), "utf8");

    assert.match(gridSource, /function readCellStyleOverridesFromHot/);
    assert.match(gridSource, /afterSetCellMeta/);
    assert.match(gridSource, /afterCreateRow/);
    assert.match(gridSource, /afterRemoveRow/);
    assert.match(gridSource, /afterCreateCol/);
    assert.match(gridSource, /afterRemoveCol/);
    assert.match(gridSource, /htCenter/);
    assert.match(gridSource, /verticalAlign/);
    assert.match(typesSource, /verticalAlign\?: SpreadsheetVerticalAlign/);
    assert.match(workbookSource, /export type SpreadsheetVerticalAlign/);
    assert.match(serverWorkbookSource, /export type SpreadsheetVerticalAlign/);
    assert.match(spreadsheetCss, /zn-cell-valign-middle/);
  });
});
