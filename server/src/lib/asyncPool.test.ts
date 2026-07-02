import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapWithConcurrency } from "./asyncPool";

describe("mapWithConcurrency", () => {
  it("preserves result order while limiting active workers", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return item * 10;
    });

    assert.deepEqual(results, [10, 20, 30, 40, 50]);
    assert.equal(maxActive, 2);
  });

  it("uses one worker for invalid concurrency values", async () => {
    let active = 0;
    let maxActive = 0;

    await mapWithConcurrency([1, 2, 3], Number.NaN, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return null;
    });

    assert.equal(maxActive, 1);
  });
});
