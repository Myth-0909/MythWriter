import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemorySlidingWindowLimiter } from "./inMemoryRateLimiter";

describe("in-memory sliding window limiter", () => {
  it("allows requests up to the max within the window", () => {
    const limiter = new InMemorySlidingWindowLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 3; i += 1) {
      const decision = limiter.check("user-1", now + i, 60_000, 3);
      assert.equal(decision.allowed, true);
    }
    assert.equal(limiter.check("user-1", now + 4, 60_000, 3).allowed, false);
  });

  it("reports remaining and retry-after", () => {
    const limiter = new InMemorySlidingWindowLimiter();
    const now = 5_000_000;
    const first = limiter.check("u", now, 60_000, 2);
    assert.equal(first.remaining, 1);
    limiter.check("u", now + 10, 60_000, 2);
    const blocked = limiter.check("u", now + 20, 60_000, 2);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
  });

  it("frees capacity once the window slides past old hits", () => {
    const limiter = new InMemorySlidingWindowLimiter();
    const now = 9_000_000;
    limiter.check("k", now, 1_000, 1);
    assert.equal(limiter.check("k", now + 500, 1_000, 1).allowed, false);
    assert.equal(limiter.check("k", now + 1_500, 1_000, 1).allowed, true);
  });

  it("isolates counts per key", () => {
    const limiter = new InMemorySlidingWindowLimiter();
    const now = 2_000_000;
    limiter.check("a", now, 60_000, 1);
    assert.equal(limiter.check("a", now + 1, 60_000, 1).allowed, false);
    assert.equal(limiter.check("b", now + 1, 60_000, 1).allowed, true);
  });
});
