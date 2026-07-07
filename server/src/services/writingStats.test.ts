import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLocalDateKey, getLocalDayRange } from "./writingStats";

describe("writing stats date helpers", () => {
  it("formats a local date key without using UTC slicing", () => {
    const date = new Date(2026, 6, 7, 23, 30, 0);

    assert.equal(formatLocalDateKey(date), "2026-07-07");
  });

  it("builds local day bounds for database day queries", () => {
    const date = new Date(2026, 6, 7, 12, 0, 0);
    const range = getLocalDayRange(date);

    assert.equal(range.start.getFullYear(), 2026);
    assert.equal(range.start.getMonth(), 6);
    assert.equal(range.start.getDate(), 7);
    assert.equal(range.start.getHours(), 0);
    assert.equal(range.end.getDate(), 8);
    assert.equal(range.end.getHours(), 0);
  });
});
