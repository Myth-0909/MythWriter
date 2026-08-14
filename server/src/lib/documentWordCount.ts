/** Count CJK characters and whitespace-delimited western words. Mirrors the editor. */
export function countDocumentWords(content: string | null | undefined): number {
  const text = String(content || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
  const cjk = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g)?.length || 0;
  const western = text
    .replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, " ")
    .replace(/[^\p{L}\p{N}_\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + western;
}
