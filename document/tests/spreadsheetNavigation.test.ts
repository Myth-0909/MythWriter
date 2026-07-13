import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("spreadsheet navigation wiring", () => {
  it("wires spreadsheets into i18n, sidebar, and app routes", () => {
    const i18nSource = readFileSync(new URL("../src/components/I18nProvider.tsx", import.meta.url), "utf8");
    const sideNavSource = readFileSync(new URL("../src/components/SideNavBar.tsx", import.meta.url), "utf8");
    const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

    assert.match(i18nSource, /"nav\.spreadsheets"/);
    assert.match(sideNavSource, /"spreadsheets"/);
    assert.match(sideNavSource, /"nav\.spreadsheets"/);
    assert.match(appSource, /SpreadsheetCenterPage/);
    assert.match(appSource, /SpreadsheetEditorPage/);
    assert.match(appSource, /spreadsheet-editor/);
    assert.match(appSource, /#\/spreadsheets/);
  });
});
