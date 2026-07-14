import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeSpreadsheetColor,
  resolveSpreadsheetColor,
} from "../src/lib/spreadsheetColors.ts";

describe("spreadsheet color helpers", () => {
  it("accepts safe custom hex colors and rejects unsafe values", () => {
    assert.equal(normalizeSpreadsheetColor("#38bdf8"), "#38bdf8");
    assert.equal(normalizeSpreadsheetColor("38BDF8"), "#38bdf8");
    assert.equal(normalizeSpreadsheetColor("#abc"), "#aabbcc");
    assert.equal(normalizeSpreadsheetColor("default"), undefined);
    assert.equal(normalizeSpreadsheetColor("url(javascript:alert(1))"), undefined);
  });

  it("resolves legacy named colors for text and fill rendering", () => {
    assert.equal(resolveSpreadsheetColor("green", "text"), "#059669");
    assert.equal(resolveSpreadsheetColor("green", "fill"), "#d1fae5");
    assert.equal(resolveSpreadsheetColor("#f97316", "fill"), "#f97316");
  });
});
