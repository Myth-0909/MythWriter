import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTodayWritingWordCounts, invalidateTodayWritingCache } from "./chatUserContext";

function createPrisma(row: { documentWords: number; journalWords: number } | null, counter: { calls: number }) {
  return {
    writingDayStat: {
      findUnique: async () => {
        counter.calls += 1;
        return row;
      },
      findMany: async () => (row ? [{ dateKey: "2026-07-17", ...row }] : []),
    },
  };
}

describe("today writing word counts", () => {
  it("reads incremental day stats instead of full document bodies", async () => {
    const counter = { calls: 0 };
    const prisma = createPrisma({ documentWords: 42, journalWords: 8 }, counter);
    const result = await getTodayWritingWordCounts("u1", {
      prisma,
      now: () => new Date(2026, 6, 17, 10, 0, 0),
      cache: new Map(),
    });
    assert.equal(result.todayDocWords, 42);
    assert.equal(result.todayJournalWords, 8);
    assert.equal(counter.calls, 1);
  });

  it("serves cached results within the TTL window without re-querying", async () => {
    const counter = { calls: 0 };
    const prisma = createPrisma({ documentWords: 4, journalWords: 0 }, counter);
    const cache = new Map();
    const opts = { prisma, ttlMs: 1000, cache, now: () => new Date(1_000_000) };
    await getTodayWritingWordCounts("u1", opts);
    await getTodayWritingWordCounts("u1", opts);
    assert.equal(counter.calls, 1);
  });

  it("re-queries once the cache entry expires", async () => {
    const counter = { calls: 0 };
    const prisma = createPrisma({ documentWords: 3, journalWords: 1 }, counter);
    const cache = new Map();
    let ts = 1_000_000;
    const opts = { prisma, ttlMs: 100, cache, now: () => new Date(ts) };
    await getTodayWritingWordCounts("u1", opts);
    ts += 200;
    await getTodayWritingWordCounts("u1", opts);
    assert.equal(counter.calls, 2);
  });

  it("isolates cache per user", async () => {
    const counter = { calls: 0 };
    const prisma = createPrisma({ documentWords: 2, journalWords: 0 }, counter);
    const cache = new Map();
    const now = () => new Date(5_000_000);
    await getTodayWritingWordCounts("a", { prisma, cache, now });
    await getTodayWritingWordCounts("b", { prisma, cache, now });
    assert.equal(counter.calls, 2);
  });

  it("clears the shared cache when writing activity is recorded", async () => {
    const counter = { calls: 0 };
    const prisma = createPrisma({ documentWords: 1, journalWords: 0 }, counter);
    await getTodayWritingWordCounts("u1", { prisma, now: () => new Date(9_000_000) });
    invalidateTodayWritingCache("u1");
    await getTodayWritingWordCounts("u1", { prisma, now: () => new Date(9_000_100) });
    assert.equal(counter.calls, 2);
  });
});
