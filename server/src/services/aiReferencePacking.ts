export type PackDocumentOptions = {
  maxChars?: number;
};

export type PackedDocumentReference = {
  text: string;
  truncated: boolean;
};

function normalizeWhitespace(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractQueryTerms(query: string): string[] {
  const raw = String(query || "").toLowerCase().trim();
  if (!raw) return [];
  const terms = new Set<string>();
  for (const term of raw.split(/[^\p{L}\p{N}]+/u)) {
    const cleaned = term.trim();
    if (cleaned.length >= 2) terms.add(cleaned);
  }
  // Chinese queries often lack spaces — add overlapping n-grams.
  const compact = raw.replace(/\s+/g, "");
  if (/[\u4e00-\u9fff]/.test(compact)) {
    for (let n = 4; n >= 2; n -= 1) {
      for (let i = 0; i <= compact.length - n; i += 1) {
        terms.add(compact.slice(i, i + n));
      }
    }
  }
  return Array.from(terms).slice(0, 40);
}

function findBestMatchStart(full: string, terms: string[]): number {
  let bestStart = -1;
  let bestLen = 0;
  const hay = full.toLowerCase();
  for (const term of terms) {
    const at = hay.indexOf(term);
    if (at >= 0 && term.length > bestLen) {
      bestStart = at;
      bestLen = term.length;
    }
  }
  return bestStart;
}

function scoreWindow(windowText: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const hay = windowText.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (hay.includes(term)) score += term.length;
  }
  return score;
}

function clipWithEllipsis(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function packDocumentReferenceText(
  content: string,
  query: string,
  options: PackDocumentOptions = {}
): PackedDocumentReference {
  const maxChars = Math.max(80, options.maxChars ?? 6000);
  const full = String(content || "");
  if (full.length <= maxChars) {
    return { text: full, truncated: false };
  }

  const terms = extractQueryTerms(query);
  const windowSize = Math.min(maxChars, Math.max(400, Math.floor(maxChars * 0.7)));
  const directStart = findBestMatchStart(full, terms);
  let bestStart = directStart >= 0 ? Math.max(0, directStart - Math.floor(windowSize * 0.25)) : 0;
  let bestScore = directStart >= 0 ? 1 : -1;

  if (terms.length > 0 && directStart < 0) {
    const step = Math.max(80, Math.floor(windowSize / 4));
    for (let start = 0; start < full.length; start += step) {
      const windowText = full.slice(start, start + windowSize);
      const score = scoreWindow(windowText, terms);
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
      }
      if (start + windowSize >= full.length) break;
    }
  }

  if (bestScore > 0) {
    const matched = full.slice(bestStart, bestStart + windowSize);
    const prefix = bestStart > 0 ? "…\n" : "";
    const suffix = bestStart + windowSize < full.length ? "\n…" : "";
    const budget = maxChars - prefix.length - suffix.length;
    return {
      text: `${prefix}${clipWithEllipsis(matched, budget)}${suffix}`,
      truncated: true,
    };
  }

  const headBudget = Math.floor(maxChars * 0.55);
  const tailBudget = maxChars - headBudget - 20;
  const head = full.slice(0, headBudget).trimEnd();
  const tail = full.slice(Math.max(0, full.length - Math.max(120, tailBudget))).trimStart();
  return {
    text: `${head}\n\n…\n\n${tail}`,
    truncated: true,
  };
}

export function packPlainDocumentForReference(
  htmlOrText: string,
  query: string,
  options: PackDocumentOptions = {}
): PackedDocumentReference {
  const plain = normalizeWhitespace(
    String(htmlOrText || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  );
  // Keep newlines for windowing by restoring paragraph breaks roughly.
  const withBreaks = String(htmlOrText || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n");
  return packDocumentReferenceText(withBreaks || plain, query, options);
}
