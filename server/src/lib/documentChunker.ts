export type DocumentChunk = {
  index: number;
  content: string;
};

type ChunkOptions = {
  chunkSize?: number;
  overlap?: number;
};

const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_OVERLAP = 128;

function normalizeChunkOptions(options: ChunkOptions = {}) {
  const chunkSize = Number.isInteger(options.chunkSize) && options.chunkSize! > 0
    ? options.chunkSize!
    : DEFAULT_CHUNK_SIZE;
  const requestedOverlap = Number.isInteger(options.overlap) && options.overlap! >= 0
    ? options.overlap!
    : DEFAULT_OVERLAP;
  const overlap = Math.min(requestedOverlap, Math.max(0, chunkSize - 1));

  return { chunkSize, overlap };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkDocument(html: string, options?: ChunkOptions): DocumentChunk[] {
  const text = htmlToText(html);
  if (!text) return [];

  const { chunkSize, overlap } = normalizeChunkOptions(options);
  const step = chunkSize - overlap;
  const chunks: DocumentChunk[] = [];

  for (let start = 0; start < text.length; start += step) {
    const content = text.slice(start, start + chunkSize);
    if (!content) break;
    chunks.push({ index: chunks.length, content });
    if (start + chunkSize >= text.length) break;
  }

  return chunks;
}
