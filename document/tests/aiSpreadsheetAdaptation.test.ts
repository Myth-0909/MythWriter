import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("AI spreadsheet adaptation wiring", () => {
  it("passes current spreadsheet context into the assistant and supports confirmed spreadsheet patches", () => {
    const root = new URL("../", import.meta.url);
    const appSource = readFileSync(new URL("src/App.tsx", root), "utf8");
    const chatSource = readFileSync(new URL("src/components/AIChatWidget.tsx", root), "utf8");
    const editorSource = readFileSync(new URL("src/pages/SpreadsheetEditorPage.tsx", root), "utf8");
    const i18nSource = readFileSync(new URL("src/components/I18nProvider.tsx", root), "utf8");

    assert.match(appSource, /currentSpreadsheetId=\{currentPage === "spreadsheet-editor"/);
    assert.match(chatSource, /currentSpreadsheetId\?: string/);
    assert.match(chatSource, /type: "document" \| "brain" \| "spreadsheet"/);
    assert.match(chatSource, /api\.getSpreadsheet\(currentSpreadsheetId\)/);
    assert.match(chatSource, /action\?\.type === "spreadsheet_patch"/);
    assert.match(chatSource, /applySpreadsheetPatch/);
    assert.match(chatSource, /spreadsheet:updated/);
    assert.match(editorSource, /spreadsheet:updated/);
    assert.match(i18nSource, /ai\.spreadsheetPatchTitle/);
    assert.match(i18nSource, /ai\.spreadsheetPatchApplied/);
  });

  it("renders AI diff previews as edited documents and spreadsheets instead of summary-only text", () => {
    const root = new URL("../", import.meta.url);
    const chatSource = readFileSync(new URL("src/components/AIChatWidget.tsx", root), "utf8");
    const i18nSource = readFileSync(new URL("src/components/I18nProvider.tsx", root), "utf8");

    assert.match(chatSource, /SpreadsheetPatchPreview/);
    assert.match(chatSource, /previousWorkbook/);
    assert.match(chatSource, /dangerouslySetInnerHTML=\{\{ __html: pendingUpdate\.nextHtml \}\}/);
    assert.match(chatSource, /ai\.diffRenderedPreview/);
    assert.match(chatSource, /ai\.spreadsheetPatchRenderedPreview/);
    assert.match(i18nSource, /ai\.diffRenderedPreview/);
    assert.match(i18nSource, /ai\.spreadsheetPatchRenderedPreview/);
  });
});
