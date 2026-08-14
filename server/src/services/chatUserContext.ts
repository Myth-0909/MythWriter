import { formatLocalDateKey, getLocalDayRange } from "./writingStats";
import { getWritingDayStat } from "./writingActivityService";

/**
 * Computes the "today's writing" word counts used as ambient context in the
 * chat system prompt. Values come from WritingDayStat (positive deltas on save),
 * not full document bodies of touched files. Results are cached briefly because
 * chat messages arrive in bursts.
 */

export type TodayWritingWordCounts = {
  todayDocWords: number;
  todayJournalWords: number;
};

type PrismaLike = {
  writingDayStat?: {
    findUnique?: (args: any) => Promise<{ documentWords: number; journalWords: number } | null>;
    findMany?: (args: any) => Promise<Array<{ dateKey: string; documentWords: number; journalWords: number }>>;
  };
};

export type TodayWritingDeps = {
  prisma: PrismaLike;
  now?: () => Date;
  ttlMs?: number;
  cache?: Map<string, { value: TodayWritingWordCounts; expiresAt: number }>;
};

const DEFAULT_TTL_MS = 45_000;
const defaultCache = new Map<string, { value: TodayWritingWordCounts; expiresAt: number }>();

export function invalidateTodayWritingCache(userId?: string) {
  if (!userId) {
    defaultCache.clear();
    return;
  }
  defaultCache.delete(userId);
}

export async function getTodayWritingWordCounts(
  userId: string,
  deps: TodayWritingDeps
): Promise<TodayWritingWordCounts> {
  const now = deps.now?.() || new Date();
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const cache = deps.cache ?? defaultCache;

  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now.getTime()) {
    return cached.value;
  }

  const todayStr = formatLocalDateKey(getLocalDayRange(now).start);
  const row = await getWritingDayStat(userId, todayStr, { prisma: deps.prisma as any });

  const value: TodayWritingWordCounts = {
    todayDocWords: row.documentWords,
    todayJournalWords: row.journalWords,
  };
  cache.set(userId, { value, expiresAt: now.getTime() + ttlMs });
  return value;
}
