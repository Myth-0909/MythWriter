export function getMentionQuery(value: string): { query: string; start: number } | null {
  const match = value.match(/(^|\s)@([^\s@]*)$/);
  if (!match || match.index === undefined) return null;
  return { query: match[2] || "", start: match.index + match[1].length };
}

export function getSlashQuery(value: string): { query: string; start: number } | null {
  const match = value.match(/(^|\s)\/([^\s/]*)$/);
  if (!match || match.index === undefined) return null;
  return { query: match[2] || "", start: match.index + match[1].length };
}

export function getBrainQuery(value: string): { query: string; start: number } | null {
  const match = value.match(/(^|\s)#([^\s#]*)$/);
  if (!match || match.index === undefined) return null;
  return { query: match[2] || "", start: match.index + match[1].length };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function textMentionsTitle(text: string, title: string, marker: "@" | "#" = "@"): boolean {
  const trimmed = String(title || "").trim();
  if (!trimmed) return false;
  const source = String(text || "");
  const needle = `${marker}${trimmed}`;
  let from = 0;
  const latinTitle = /^[A-Za-z0-9]/.test(trimmed);

  while (from <= source.length) {
    const at = source.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : source[at - 1];
    const after = at + needle.length >= source.length ? "" : source[at + needle.length];
    const afterOk = !after || /[^\p{L}\p{N}]/u.test(after);
    if (!afterOk) {
      from = at + 1;
      continue;
    }
    if (latinTitle) {
      if (!before || /[^A-Za-z0-9]/u.test(before)) return true;
    } else if (!before || /[^\p{L}\p{N}]/u.test(before) || /[\u4e00-\u9fff]/u.test(before)) {
      return true;
    }
    from = at + 1;
  }
  return false;
}

export function parseToolArguments(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
