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

  it("wires a formula bar and name box to the spreadsheet grid", () => {
    const root = new URL("../", import.meta.url);
    const editorSource = readFileSync(new URL("src/pages/SpreadsheetEditorPage.tsx", root), "utf8");
    const gridSource = readFileSync(new URL("src/components/spreadsheet/SpreadsheetGrid.tsx", root), "utf8");
    const formulaBarPath = resolve(new URL("src/components/spreadsheet/SpreadsheetFormulaBar.tsx", root).pathname);
    const i18nSource = readFileSync(new URL("src/components/I18nProvider.tsx", root), "utf8");

    assert.equal(existsSync(formulaBarPath), true);
    assert.match(editorSource, /SpreadsheetFormulaBar/);
    assert.match(editorSource, /formulaBarState/);
    assert.match(editorSource, /onNavigateToCell/);
    assert.match(editorSource, /onCommitFormulaValue/);
    assert.match(gridSource, /getActiveCellState/);
    assert.match(gridSource, /navigateToCell/);
    assert.match(gridSource, /setActiveCellValue/);
    assert.match(i18nSource, /sheets\.formulaBar/);
    assert.match(i18nSource, /sheets\.nameBox/);
  });

  it("wires a find and replace panel into the spreadsheet editor", () => {
    const root = new URL("../", import.meta.url);
    const editorSource = readFileSync(new URL("src/pages/SpreadsheetEditorPage.tsx", root), "utf8");
    const toolbarSource = readFileSync(new URL("src/components/spreadsheet/SpreadsheetToolbar.tsx", root), "utf8");
    const findReplacePath = resolve(new URL("src/components/spreadsheet/SpreadsheetFindReplace.tsx", root).pathname);
    const i18nSource = readFileSync(new URL("src/components/I18nProvider.tsx", root), "utf8");

    assert.equal(existsSync(findReplacePath), true);
    assert.match(editorSource, /SpreadsheetFindReplace/);
    assert.match(editorSource, /findSpreadsheetMatches/);
    assert.match(editorSource, /replaceAllSpreadsheetMatches/);
    assert.match(toolbarSource, /onToggleFindReplace/);
    assert.match(toolbarSource, /sheets\.findReplace/);
    assert.match(i18nSource, /sheets\.replaceAll/);
    assert.match(i18nSource, /sheets\.matchCount/);
  });

  it("wires a spreadsheet selection status bar", () => {
    const root = new URL("../", import.meta.url);
    const editorSource = readFileSync(new URL("src/pages/SpreadsheetEditorPage.tsx", root), "utf8");
    const gridSource = readFileSync(new URL("src/components/spreadsheet/SpreadsheetGrid.tsx", root), "utf8");
    const statusBarPath = resolve(new URL("src/components/spreadsheet/SpreadsheetStatusBar.tsx", root).pathname);
    const i18nSource = readFileSync(new URL("src/components/I18nProvider.tsx", root), "utf8");

    assert.equal(existsSync(statusBarPath), true);
    assert.match(editorSource, /SpreadsheetStatusBar/);
    assert.match(editorSource, /selectionSummary/);
    assert.match(gridSource, /onSelectionSummaryChange/);
    assert.match(gridSource, /buildSpreadsheetSelectionSummary/);
    assert.match(i18nSource, /sheets\.statusAverage/);
    assert.match(i18nSource, /sheets\.statusCount/);
  });

  it("wires enhanced sheet tab management actions", () => {
    const root = new URL("../", import.meta.url);
    const editorSource = readFileSync(new URL("src/pages/SpreadsheetEditorPage.tsx", root), "utf8");
    const tabsSource = readFileSync(new URL("src/components/spreadsheet/SheetTabs.tsx", root), "utf8");
    const i18nSource = readFileSync(new URL("src/components/I18nProvider.tsx", root), "utf8");

    assert.match(tabsSource, /onRenameSheet/);
    assert.match(tabsSource, /onDuplicateSheet/);
    assert.match(tabsSource, /onMoveSheet/);
    assert.match(tabsSource, /DialogContent/);
    assert.match(editorSource, /duplicateSpreadsheetSheet/);
    assert.match(editorSource, /moveSpreadsheetSheet/);
    assert.match(i18nSource, /sheets\.duplicateSheet/);
    assert.match(i18nSource, /sheets\.moveSheetLeft/);
  });
});
