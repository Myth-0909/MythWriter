export function formatLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDayRange(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

/** Monday–Sunday calendar week in local time. `end` is exclusive (next Monday 00:00). */
export function getLocalCalendarWeekRange(date = new Date()): {
  start: Date;
  end: Date;
  days: string[];
} {
  const day = date.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(formatLocalDateKey(d));
  }
  return { start, end, days };
}

/** Words newly written: only positive growth counts toward daily writing stats. */
export function positiveWordDelta(
  previousWords: number | null | undefined,
  nextWords: number | null | undefined
): number {
  const prev = Math.max(0, Math.floor(Number(previousWords) || 0));
  const next = Math.max(0, Math.floor(Number(nextWords) || 0));
  return Math.max(0, next - prev);
}

/** Net content growth. Deletions offset later retyping instead of being counted twice. */
export function netWordDelta(
  previousWords: number | null | undefined,
  nextWords: number | null | undefined
): number {
  const prev = Math.max(0, Math.floor(Number(previousWords) || 0));
  const next = Math.max(0, Math.floor(Number(nextWords) || 0));
  return next - prev;
}
