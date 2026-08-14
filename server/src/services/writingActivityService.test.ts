import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordWritingDelta, listWritingDayStats } from "./writingActivityService";

describe("writing activity service", () => {
  it("skips upsert when both deltas are zero", async () => {
    let upsertCalls = 0;
    const prisma = {
      writingDayStat: {
        upsert: async () => {
          upsertCalls += 1;
          return {};
        },
      },
    };

    await recordWritingDelta("u1", { documentWords: 0, journalWords: 0 }, { prisma: prisma as any });
    assert.equal(upsertCalls, 0);
  });

  it("upserts positive document and journal deltas for the local date key", async () => {
    let captured: any = null;
    const prisma = {
      writingDayStat: {
        upsert: async (args: any) => {
          captured = args;
          return {};
        },
      },
    };

    await recordWritingDelta(
      "u1",
      { documentWords: 120, journalWords: 30 },
      { prisma: prisma as any, now: new Date(2026, 6, 17, 18, 0, 0) }
    );

    assert.equal(captured.where.userId_dateKey.userId, "u1");
    assert.equal(captured.where.userId_dateKey.dateKey, "2026-07-17");
    assert.equal(captured.create.documentWords, 120);
    assert.equal(captured.create.journalWords, 30);
    assert.deepEqual(captured.update.documentWords, { increment: 120 });
    assert.deepEqual(captured.update.journalWords, { increment: 30 });
  });

  it("lists day stats keyed by date with zeros for missing days", async () => {
    const prisma = {
      writingDayStat: {
        findMany: async () => [
          { dateKey: "2026-07-14", documentWords: 10, journalWords: 5 },
          { dateKey: "2026-07-16", documentWords: 20, journalWords: 0 },
        ],
      },
    };

    const rows = await listWritingDayStats(
      "u1",
      ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"],
      { prisma: prisma as any }
    );

    assert.deepEqual(rows, [
      { dateKey: "2026-07-13", documentWords: 0, journalWords: 0 },
      { dateKey: "2026-07-14", documentWords: 10, journalWords: 5 },
      { dateKey: "2026-07-15", documentWords: 0, journalWords: 0 },
      { dateKey: "2026-07-16", documentWords: 20, journalWords: 0 },
    ]);
  });
});
