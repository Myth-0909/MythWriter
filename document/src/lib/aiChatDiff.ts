export type DiffLine = {
  type: "added" | "removed" | "unchanged";
  text: string;
};

export type DiffStats = {
  added: number;
  removed: number;
  unchanged: number;
};

export function htmlToPlainText(html: string): string {
  const withLineBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n");
  if (typeof window === "undefined") return withLineBreaks.replace(/<[^>]*>/g, "");
  const container = window.document.createElement("div");
  container.innerHTML = withLineBreaks;
  return container.textContent || "";
}

function splitComparableLines(value: string): string[] {
  const lines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [value.trim()].filter(Boolean);
}

export function buildDiffLines(beforeText: string, afterText: string): DiffLine[] {
  const before = splitComparableLines(beforeText);
  const after = splitComparableLines(afterText);
  if (before.length === 0 && after.length === 0) return [];

  // Keep the preview lightweight for very long documents.
  if (before.length * after.length > 40000) {
    const rows: DiffLine[] = [];
    const max = Math.max(before.length, after.length);
    for (let i = 0; i < max; i += 1) {
      if (before[i] === after[i]) {
        rows.push({ type: "unchanged", text: before[i] });
      } else {
        if (before[i]) rows.push({ type: "removed", text: before[i] });
        if (after[i]) rows.push({ type: "added", text: after[i] });
      }
    }
    return rows;
  }

  const dp = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      rows.push({ type: "unchanged", text: before[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: "removed", text: before[i] });
      i += 1;
    } else {
      rows.push({ type: "added", text: after[j] });
      j += 1;
    }
  }
  while (i < before.length) {
    rows.push({ type: "removed", text: before[i] });
    i += 1;
  }
  while (j < after.length) {
    rows.push({ type: "added", text: after[j] });
    j += 1;
  }
  return rows;
}

export function summarizeDiff(lines: DiffLine[]): DiffStats {
  return lines.reduce(
    (stats, line) => {
      stats[line.type] += 1;
      return stats;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );
}
