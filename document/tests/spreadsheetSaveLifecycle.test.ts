import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("../src/pages/SpreadsheetEditorPage.tsx", import.meta.url), "utf8");

describe("spreadsheet save lifecycle", () => {
  it("marks title and workbook changes as unsaved", () => {
    assert.match(source, /const handleTitleChange[\s\S]*?markUnsaved\(\)/);
    assert.match(source, /const replaceWorkbook[\s\S]*?markUnsaved\(\)/);
  });

  it("flushes every pending revision before in-app navigation", () => {
    assert.match(source, /const handleBack = async[\s\S]*?while \(lastSavedVersionRef\.current < changeVersionRef\.current\)[\s\S]*?await saveWorkbookRef\.current\(\)[\s\S]*?onBack\(\)/);
  });

  it("attempts a final flush on unmount and warns on browser close", () => {
    assert.match(source, /useEffect\(\(\) => \(\) => \{[\s\S]*?await saveWorkbookRef\.current\(\)/);
    assert.match(source, /addEventListener\("beforeunload", handleBeforeUnload\)/);
  });
});
