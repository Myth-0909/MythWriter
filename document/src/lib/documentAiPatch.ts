export type DocumentPatchOperation = {
  type: "replace_once" | "replace_all";
  find: string;
  replace: string;
};

export type DocumentPatchResult = {
  content: string;
  applied: number;
  errors: string[];
};

export type DocumentHtmlPatchResult = DocumentPatchResult & {
  html: string;
};

function normalizeWs(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtmlText(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function findFlexibleRange(source: string, find: string): { start: number; end: number } | null {
  const exact = source.indexOf(find);
  if (exact >= 0) return { start: exact, end: exact + find.length };

  const needle = normalizeWs(find);
  if (!needle) return null;

  const sourceNorm: Array<{ ch: string; index: number }> = [];
  let pendingSpace = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      pendingSpace = sourceNorm.length > 0;
      continue;
    }
    if (pendingSpace) {
      sourceNorm.push({ ch: " ", index: i });
      pendingSpace = false;
    }
    sourceNorm.push({ ch, index: i });
  }
  const hay = sourceNorm.map((item) => item.ch).join("");
  const at = hay.indexOf(needle);
  if (at < 0) return null;
  const start = sourceNorm[at]?.index ?? 0;
  const endIndex = sourceNorm[at + needle.length - 1]?.index;
  if (endIndex === undefined) return null;
  return { start, end: endIndex + 1 };
}

function replaceOnceFlexible(source: string, find: string, replace: string): { content: string; ok: boolean } {
  const range = findFlexibleRange(source, find);
  if (!range) return { content: source, ok: false };
  return {
    content: `${source.slice(0, range.start)}${replace}${source.slice(range.end)}`,
    ok: true,
  };
}

function replaceAllFlexible(source: string, find: string, replace: string): { content: string; ok: boolean } {
  let content = source;
  let ok = false;
  while (true) {
    const next = replaceOnceFlexible(content, find, replace);
    if (!next.ok) break;
    ok = true;
    content = next.content;
    // Prevent infinite loops if replace still contains find.
    if (normalizeWs(find) && normalizeWs(replace).includes(normalizeWs(find))) break;
  }
  return { content, ok };
}

export function applyDocumentPatches(
  source: string,
  operations: DocumentPatchOperation[]
): DocumentPatchResult {
  let content = String(source || "");
  let applied = 0;
  const errors: string[] = [];

  for (const [index, op] of operations.entries()) {
    const find = String(op?.find || "");
    if (!find.trim()) {
      errors.push(`op ${index + 1}: empty find`);
      continue;
    }
    const replace = String(op?.replace ?? "");
    const result =
      op.type === "replace_all"
        ? replaceAllFlexible(content, find, replace)
        : replaceOnceFlexible(content, find, replace);
    if (!result.ok) {
      errors.push(`op ${index + 1}: find not found`);
      continue;
    }
    content = result.content;
    applied += 1;
  }

  return { content, applied, errors };
}

/**
 * Replace visible text inside HTML while keeping tags intact.
 * Matches plain text (with flexible whitespace) against text nodes only.
 */
function replacePlainTextInHtmlOnce(html: string, find: string, replace: string): { html: string; ok: boolean } {
  const needle = normalizeWs(find);
  if (!needle) return { html, ok: false };
  const safeReplace = escapeHtmlText(replace);

  type TextPos = { htmlIndex: number; ch: string };
  const positions: TextPos[] = [];
  let inTag = false;
  let pendingSpace = false;
  for (let i = 0; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === "<") {
      inTag = true;
      continue;
    }
    if (ch === ">" && inTag) {
      inTag = false;
      continue;
    }
    if (inTag) continue;
    if (/\s/.test(ch)) {
      pendingSpace = positions.length > 0;
      continue;
    }
    if (pendingSpace) {
      positions.push({ htmlIndex: -1, ch: " " });
      pendingSpace = false;
    }
    positions.push({ htmlIndex: i, ch });
  }

  const hay = positions.map((item) => item.ch).join("");
  const at = hay.indexOf(needle);
  if (at >= 0) {
    const matchedHtmlIndexes = new Set<number>();
    for (let i = at; i < at + needle.length; i += 1) {
      const pos = positions[i];
      if (!pos || pos.htmlIndex < 0) continue;
      matchedHtmlIndexes.add(pos.htmlIndex);
    }
    if (matchedHtmlIndexes.size > 0) {
      let out = "";
      let replaced = false;
      inTag = false;
      for (let i = 0; i < html.length; i += 1) {
        const ch = html[i];
        if (ch === "<") {
          inTag = true;
          out += ch;
          continue;
        }
        if (ch === ">" && inTag) {
          inTag = false;
          out += ch;
          continue;
        }
        if (inTag) {
          out += ch;
          continue;
        }
        if (matchedHtmlIndexes.has(i)) {
          if (!replaced) {
            out += safeReplace;
            replaced = true;
          }
          continue;
        }
        out += ch;
      }
      return { html: out, ok: true };
    }
  }

  // Exact HTML fallback only for intentional markup / longer unique chunks —
  // never for short bare tokens that can hit attributes or tag names.
  const trimmed = find.trim();
  if (!trimmed || /^[a-zA-Z0-9_-]{1,32}$/.test(trimmed)) {
    return { html, ok: false };
  }
  const exact = html.indexOf(find);
  if (exact >= 0) {
    return {
      html: `${html.slice(0, exact)}${safeReplace}${html.slice(exact + find.length)}`,
      ok: true,
    };
  }
  return { html, ok: false };
}

export function applyDocumentPatchesPreferHtml(
  html: string,
  operations: DocumentPatchOperation[]
): DocumentHtmlPatchResult {
  let content = String(html || "");
  let applied = 0;
  const errors: string[] = [];

  for (const [index, op] of operations.entries()) {
    const find = String(op?.find || "");
    if (!find.trim()) {
      errors.push(`op ${index + 1}: empty find`);
      continue;
    }
    const replace = String(op?.replace ?? "");
    if (op.type === "replace_all") {
      let changed = false;
      while (true) {
        const next = replacePlainTextInHtmlOnce(content, find, replace);
        if (!next.ok) break;
        changed = true;
        content = next.html;
        if (normalizeWs(replace).includes(normalizeWs(find))) break;
      }
      if (!changed) {
        errors.push(`op ${index + 1}: find not found`);
        continue;
      }
      applied += 1;
      continue;
    }

    const once = replacePlainTextInHtmlOnce(content, find, replace);
    if (!once.ok) {
      errors.push(`op ${index + 1}: find not found`);
      continue;
    }
    content = once.html;
    applied += 1;
  }

  return { content, html: content, applied, errors };
}
