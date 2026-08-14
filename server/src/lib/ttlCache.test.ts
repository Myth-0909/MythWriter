import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TtlCache } from "./ttlCache";

describe("ttl cache", () => {
  it("returns stored values within the TTL", () => {
    let ts = 1000;
    const cache = new TtlCache<string>(500, () => ts);
    cache.set("k", "v");
    assert.equal(cache.get("k"), "v");
    ts += 400;
    assert.equal(cache.get("k"), "v");
  });

  it("expires values past the TTL and evicts them", () => {
    let ts = 1000;
    const cache = new TtlCache<string>(500, () => ts);
    cache.set("k", "v");
    ts += 600;
    assert.equal(cache.get("k"), undefined);
    assert.equal(cache.size, 0);
  });

  it("returns undefined for missing keys", () => {
    const cache = new TtlCache<number>(1000);
    assert.equal(cache.get("nope"), undefined);
  });

  it("clears all entries", () => {
    const cache = new TtlCache<number>(1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    assert.equal(cache.size, 0);
  });
});
