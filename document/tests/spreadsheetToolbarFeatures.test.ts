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

  it("keeps spreadsheet row and column headers vertically centered", () => {
    const spreadsheetCss = readFileSync(new URL("../src/components/spreadsheet/spreadsheet.css", import.meta.url), "utf8");

    assert.match(
      spreadsheetCss,
      /\.zn-spreadsheet-grid \.handsontable \.htCore th\s*\{[^}]*vertical-align:\s*middle;/s
    );
    assert.match(
      spreadsheetCss,
      /\.zn-spreadsheet-grid \.handsontable tbody tr th \.relative\s*\{[^}]*display:\s*flex;[^}]*height:\s*100%;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s
    );
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

  it("exposes filter controls through the spreadsheet toolbar", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");
    const editorSource = readFileSync(new URL("../src/pages/SpreadsheetEditorPage.tsx", import.meta.url), "utf8");
    const i18nSource = readFileSync(new URL("../src/components/I18nProvider.tsx", import.meta.url), "utf8");

    assert.match(toolbarSource, /onOpenFilterMenu/);
    assert.match(toolbarSource, /onClearFilters/);
    assert.match(toolbarSource, /sheets\.openFilterMenu/);
    assert.match(gridSource, /openFilterMenu/);
    assert.match(gridSource, /clearFilters/);
    assert.match(editorSource, /gridRef\.current\?\.openFilterMenu/);
    assert.match(editorSource, /gridRef\.current\?\.clearFilters/);
    assert.match(i18nSource, /sheets\.clearFilters/);
  });

  it("exposes number formats and extended cell formatting controls", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");
    const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const spreadsheetCss = readFileSync(new URL("../src/components/spreadsheet/spreadsheet.css", import.meta.url), "utf8");
    const i18nSource = readFileSync(new URL("../src/components/I18nProvider.tsx", import.meta.url), "utf8");

    assert.match(typesSource, /SpreadsheetNumberFormat/);
    assert.match(typesSource, /fontSize\?: SpreadsheetFontSize/);
    assert.match(toolbarSource, /onSetNumberFormat/);
    assert.match(toolbarSource, /onSetVerticalAlign/);
    assert.match(toolbarSource, /onClearFormat/);
    assert.match(toolbarSource, /sheets\.numberFormatCurrency/);
    assert.match(gridSource, /formatSpreadsheetCellDisplay/);
    assert.match(gridSource, /clearSelectedFormats/);
    assert.match(spreadsheetCss, /zn-cell-border/);
    assert.match(i18nSource, /sheets\.clearFormat/);
  });

  it("uses a custom color palette and keeps toolbar actions anchored to the selected cells", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");
    const typesSource = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
    const colorsSource = readFileSync(new URL("../src/lib/spreadsheetColors.ts", import.meta.url), "utf8");
    const i18nSource = readFileSync(new URL("../src/components/I18nProvider.tsx", import.meta.url), "utf8");

    assert.match(toolbarSource, /Popover/);
    assert.match(toolbarSource, /ColorPaletteButton/);
    assert.match(toolbarSource, /CUSTOM_COLOR_PALETTE/);
    assert.doesNotMatch(toolbarSource, /const colorSwatches/);
    assert.match(toolbarSource, /onMouseDown=\{preserveSpreadsheetSelection\}/);
    assert.match(toolbarSource, /sheets\.applyColor/);
    assert.match(toolbarSource, /ToolbarIconButton label=\{t\("sheets\.fontSizeSmall"\)\}/);
    assert.match(toolbarSource, /ToolbarIconButton label=\{t\("sheets\.fontSizeLarge"\)\}/);
    assert.match(gridSource, /restoreStoredSelection/);
    assert.match(gridSource, /resolveSpreadsheetColor/);
    assert.match(gridSource, /td\.style\.backgroundColor/);
    assert.match(typesSource, /export type SpreadsheetCellColor = string/);
    assert.match(colorsSource, /normalizeSpreadsheetColor/);
    assert.match(i18nSource, /sheets\.customColor/);
  });

  it("exposes row and column sizing controls", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");
    const editorSource = readFileSync(new URL("../src/pages/SpreadsheetEditorPage.tsx", import.meta.url), "utf8");
    const i18nSource = readFileSync(new URL("../src/components/I18nProvider.tsx", import.meta.url), "utf8");

    assert.match(toolbarSource, /onAutoFitColumns/);
    assert.match(toolbarSource, /onResetColumnWidths/);
    assert.match(toolbarSource, /onSetRowHeight/);
    assert.match(toolbarSource, /sheets\.rowHeight/);
    assert.match(toolbarSource, /sheets\.rowHeightCompact/);
    assert.match(toolbarSource, /sheets\.rowHeightCustom/);
    assert.match(toolbarSource, /onSetRowHeight\(30\)/);
    assert.match(toolbarSource, /min=\{30\}/);
    assert.match(toolbarSource, /onResetRowHeights/);
    assert.match(gridSource, /autoFitSelectedColumns/);
    assert.match(gridSource, /resetSelectedColumnWidths/);
    assert.match(gridSource, /const MIN_ROW_HEIGHT = 30/);
    assert.match(gridSource, /setSelectedRowHeight/);
    assert.match(gridSource, /resetSelectedRowHeights/);
    assert.match(editorSource, /gridRef\.current\?\.autoFitSelectedColumns/);
    assert.match(editorSource, /handleSetRowHeight/);
    assert.match(editorSource, /gridRef\.current\?\.setSelectedRowHeight/);
    assert.match(i18nSource, /sheets\.autoFitColumns/);
    assert.match(i18nSource, /sheets\.rowHeight/);
    assert.match(i18nSource, /sheets\.rowHeightPixels/);
  });

  it("keeps header row and column selections for toolbar sizing actions", () => {
    const gridSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetGrid.tsx", import.meta.url), "utf8");

    assert.match(gridSource, /function isUsableSelectionTuple/);
    assert.match(gridSource, /value >= -1/);
    assert.match(gridSource, /function getAxisSelectionBounds/);
    assert.match(gridSource, /if \(a < 0 && b < 0\) return \{ start: 0, end: count - 1 \}/);
    assert.doesNotMatch(gridSource, /every\(\(value\) => Number\.isInteger\(value\) && value >= 0\)/);
  });

  it("closes the structure menu before applying sheet mutations", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");

    assert.match(toolbarSource, /const \[structureMenuOpen, setStructureMenuOpen\] = useState\(false\)/);
    assert.match(toolbarSource, /const pendingStructureActionRef = useRef<\(\(\) => void\) \| null>\(null\)/);
    assert.match(toolbarSource, /useEffect\(\(\) => \{/);
    assert.match(toolbarSource, /function runStructureAction/);
    assert.match(toolbarSource, /event\.preventDefault\(\)/);
    assert.match(toolbarSource, /pendingStructureActionRef\.current = action/);
    assert.match(toolbarSource, /setStructureMenuOpen\(false\)/);
    assert.match(toolbarSource, /window\.requestAnimationFrame\(\(\) => action\(\)\)/);
    assert.doesNotMatch(toolbarSource, /window\.setTimeout\(\(\) => action\(\), 0\)/);
    assert.match(toolbarSource, /<DropdownMenu open=\{structureMenuOpen\} onOpenChange=\{setStructureMenuOpen\} modal=\{false\}>/);
    assert.match(toolbarSource, /<DropdownMenuContent\s+align="start"\s+className="min-w-\[220px\]"\s+onCloseAutoFocus=\{\(event\) => event\.preventDefault\(\)\}/);
    assert.match(toolbarSource, /onSelect=\{\(event\) => runStructureAction\(event, \(\) => onSetRowHeight\(40\)\)\}/);
  });

  it("exposes csv import/export and import busy state", () => {
    const toolbarSource = readFileSync(new URL("../src/components/spreadsheet/SpreadsheetToolbar.tsx", import.meta.url), "utf8");
    const editorSource = readFileSync(new URL("../src/pages/SpreadsheetEditorPage.tsx", import.meta.url), "utf8");
    const importExportSource = readFileSync(new URL("../src/lib/spreadsheetImportExport.ts", import.meta.url), "utf8");
    const i18nSource = readFileSync(new URL("../src/components/I18nProvider.tsx", import.meta.url), "utf8");

    assert.match(toolbarSource, /onImportCsv/);
    assert.match(toolbarSource, /onExportCsv/);
    assert.match(editorSource, /importing/);
    assert.match(editorSource, /workbookFromCsvText/);
    assert.match(editorSource, /workbookToCsvText/);
    assert.match(importExportSource, /CSV_MIME/);
    assert.match(i18nSource, /sheets\.importCsv/);
    assert.match(i18nSource, /sheets\.importing/);
  });
});
