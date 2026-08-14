import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLocalDateKey,
  getLocalCalendarWeekRange,
  getLocalDayRange,
  positiveWordDelta,
  netWordDelta,
} from "./writingStats";

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

  it("counts only positive word deltas for writing activity", () => {
    assert.equal(positiveWordDelta(100, 150), 50);
    assert.equal(positiveWordDelta(150, 120), 0);
    assert.equal(positiveWordDelta(0, 80), 80);
  assert.equal(positiveWordDelta(undefined, 40), 40);
  assert.equal(netWordDelta(150, 120), -30);
  assert.equal(netWordDelta(120, 150), 30);
  });

  it("builds a Monday-Sunday calendar week in local time", () => {
    // Friday 2026-07-17 → Mon 07-13 … Sun 07-19
    const friday = new Date(2026, 6, 17, 15, 0, 0);
    const week = getLocalCalendarWeekRange(friday);

    assert.equal(formatLocalDateKey(week.start), "2026-07-13");
    assert.equal(formatLocalDateKey(week.end), "2026-07-20");
    assert.deepEqual(week.days, [
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
      "2026-07-19",
    ]);
  });

  it("treats Sunday as the end of the prior Monday-started week", () => {
    const sunday = new Date(2026, 6, 19, 9, 0, 0);
    const week = getLocalCalendarWeekRange(sunday);
    assert.equal(week.days[0], "2026-07-13");
    assert.equal(week.days[6], "2026-07-19");
  });
});
