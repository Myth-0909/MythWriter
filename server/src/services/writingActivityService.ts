import prisma from "../lib/prisma";
import { formatLocalDateKey } from "./writingStats";

export type WritingDayStatRow = {
  dateKey: string;
  documentWords: number;
  journalWords: number;
};

type WritingDayStatPrisma = {
  writingDayStat: {
    upsert: (args: any) => Promise<unknown>;
    findMany: (args: any) => Promise<Array<{ dateKey: string; documentWords: number; journalWords: number }>>;
    findUnique?: (args: any) => Promise<{ documentWords: number; journalWords: number } | null>;
  };
};

export type WritingActivityDeps = {
  prisma?: WritingDayStatPrisma;
  now?: Date;
};

function client(deps?: WritingActivityDeps): WritingDayStatPrisma {
  return (deps?.prisma || prisma) as WritingDayStatPrisma;
}

export async function recordWritingDelta(
  userId: string,
  delta: { documentWords?: number; journalWords?: number },
  deps?: WritingActivityDeps
): Promise<void> {
  const documentWords = Math.trunc(Number(delta.documentWords) || 0);
  const journalWords = Math.trunc(Number(delta.journalWords) || 0);
  if (documentWords === 0 && journalWords === 0) return;

  const dateKey = formatLocalDateKey(deps?.now || new Date());
  await client(deps).writingDayStat.upsert({
    where: { userId_dateKey: { userId, dateKey } },
    create: { userId, dateKey, documentWords, journalWords },
    update: {
      ...(documentWords !== 0 ? { documentWords: { increment: documentWords } } : {}),
      ...(journalWords !== 0 ? { journalWords: { increment: journalWords } } : {}),
    },
  });
}

export async function listWritingDayStats(
  userId: string,
  dateKeys: string[],
  deps?: WritingActivityDeps
): Promise<WritingDayStatRow[]> {
  if (dateKeys.length === 0) return [];

  const rows = await client(deps).writingDayStat.findMany({
    where: { userId, dateKey: { in: dateKeys } },
    select: { dateKey: true, documentWords: true, journalWords: true },
  });

  const byKey = new Map(rows.map((row) => [row.dateKey, row]));
  return dateKeys.map((dateKey) => {
    const row = byKey.get(dateKey);
    return {
      dateKey,
      documentWords: row?.documentWords || 0,
      journalWords: row?.journalWords || 0,
    };
  });
}

export async function getWritingDayStat(
  userId: string,
  dateKey: string,
  deps?: WritingActivityDeps
): Promise<WritingDayStatRow> {
  const findUnique = client(deps).writingDayStat.findUnique;
  if (findUnique) {
    const row = await findUnique({
      where: { userId_dateKey: { userId, dateKey } },
      select: { documentWords: true, journalWords: true },
    });
    return {
      dateKey,
      documentWords: row?.documentWords || 0,
      journalWords: row?.journalWords || 0,
    };
  }

  const [row] = await listWritingDayStats(userId, [dateKey], deps);
  return row || { dateKey, documentWords: 0, journalWords: 0 };
}
