type SearchLabels = {
  results: string;
  empty: string;
  idle: string;
};

type ImportPreviewInput = {
  fileName: string;
  extension: string;
  content: string;
};

type ImportPreview = {
  title: string;
  extension: string;
  wordCount: number;
};

type CountableDocument = {
  isFavorite?: boolean;
  isDeleted?: boolean;
};

function stripHtml(value: string): string {
  const decodeCodePoint = (match: string, rawValue: string, radix: number) => {
    const codePoint = Number.parseInt(rawValue, radix);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
    return String.fromCodePoint(codePoint);
  };

  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (match, value: string) => decodeCodePoint(match, value, 16))
    .replace(/&#(\d+);/g, (match, value: string) => decodeCodePoint(match, value, 10))
    .trim();
}

export function stripRedundantLeadingTitle(content: string, title: string): string {
  if (!content.trim() || !title.trim()) return content;
  const match = content.match(/^\s*<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>\s*/i);
  if (!match) return content;

  const normalize = (value: string) => stripHtml(value).replace(/\s+/g, " ").trim().toLowerCase();
  if (normalize(match[1]) !== normalize(title)) return content;
  return content.slice(match[0].length);
}

export function countWritingUnits(value: string): number {
  const text = stripHtml(value);
  const cjk = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g)?.length || 0;
  const western = text
    .replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, " ")
    .replace(/[^\p{L}\p{N}_\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + western;
}

export function buildSearchStatus(count: number, query: string, labels: SearchLabels): string {
  if (!query.trim()) return labels.idle;
  if (count === 0) return labels.empty;
  return labels.results.replace("{count}", String(count));
}

export function buildImportPreview(input: ImportPreviewInput): ImportPreview {
  return {
    title: input.fileName.replace(/\.[^.]+$/, "") || input.fileName,
    extension: input.extension.toLowerCase(),
    wordCount: countWritingUnits(input.content),
  };
}

export function hasProfileChanges(nextName: string, currentName: string): boolean {
  return nextName.trim() !== currentName.trim();
}

export function buildDraftKey(period: string, targetDate: string): string {
  return `znwriter_work_record_draft:${period}:${targetDate}`;
}

export function buildIndexProgressLabel(template: string, done: number, total: number): string {
  return template.replace("{done}", String(done)).replace("{total}", String(total));
}

export function getFavoriteToggleKey(isFavorite: boolean): "editor.favorite" | "editor.unfavorite" {
  return isFavorite ? "editor.unfavorite" : "editor.favorite";
}

export function buildDocumentCountSummary(documents: CountableDocument[]) {
  const active = documents.filter((doc) => !doc.isDeleted);
  const favorites = active.filter((doc) => doc.isFavorite).length;
  return {
    total: active.length,
    library: active.length - favorites,
    favorites,
  };
}
