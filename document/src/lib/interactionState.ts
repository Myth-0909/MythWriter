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

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
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
