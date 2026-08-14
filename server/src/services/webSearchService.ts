import { createLinkedTimeoutSignal } from "../lib/abortSignal";
import { t } from "../lib/i18n";
import { TtlCache } from "../lib/ttlCache";

type SearchEntry = {
  title: string;
  url: string;
  snippet: string;
};

type WebSearchFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type WebSearchOptions = {
  lang?: string;
  signal?: AbortSignal;
  fetchImpl?: WebSearchFetch;
  timeoutMs?: number;
};

type SearchProvider = {
  name: string;
  url: (query: string, lang: string) => string;
  accept: string;
  parse: (payload: string) => SearchEntry[];
};

const webSearchCache = new TtlCache<string>(5 * 60 * 1000);

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;|&ensp;|&emsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#x27;/gi, "'");
}

function cleanText(value: string, maxLength = 600): string {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeResultUrl(value: string): string {
  const decoded = decodeEntities(value).trim();
  if (!decoded) return "";
  try {
    const url = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.hostname.endsWith("duckduckgo.com") && url.searchParams.get("uddg")) {
      return normalizeResultUrl(url.searchParams.get("uddg") || "");
    }
    return url.toString();
  } catch {
    return "";
  }
}

function xmlTag(block: string, tag: string): string {
  return block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "";
}

export function parseBingRss(payload: string): SearchEntry[] {
  return [...payload.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => ({
      title: cleanText(xmlTag(match[1], "title"), 240),
      url: normalizeResultUrl(cleanText(xmlTag(match[1], "link"), 2000)),
      snippet: cleanText(xmlTag(match[1], "description")),
    }))
    .filter((item) => item.title && item.url)
    .slice(0, 5);
}

export function parseBingHtml(payload: string): SearchEntry[] {
  return [...payload.matchAll(/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => {
      const block = match[1];
      return {
        title: cleanText(block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "", 240),
        url: normalizeResultUrl(block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/i)?.[1] || ""),
        snippet: cleanText(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ""),
      };
    })
    .filter((item) => item.title && item.url)
    .slice(0, 5);
}

export function parseDuckDuckGoHtml(payload: string): SearchEntry[] {
  const blocks = [...payload.matchAll(/<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*result|$)/gi)];
  return blocks
    .map((match) => {
      const block = match[1];
      return {
        title: cleanText(block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "", 240),
        url: normalizeResultUrl(block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"/i)?.[1] || ""),
        snippet: cleanText(block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || ""),
      };
    })
    .filter((item) => item.title && item.url)
    .slice(0, 5);
}

const providers: SearchProvider[] = [
  {
    name: "Bing RSS",
    url: (query, lang) => `${lang === "en" ? "https://www.bing.com" : "https://cn.bing.com"}/search?format=rss&q=${encodeURIComponent(query)}`,
    accept: "application/rss+xml, application/xml, text/xml",
    parse: parseBingRss,
  },
  {
    name: "Bing HTML",
    url: (query, lang) => `${lang === "en" ? "https://www.bing.com" : "https://cn.bing.com"}/search?q=${encodeURIComponent(query)}&setlang=${lang === "en" ? "en" : "zh-hans"}`,
    accept: "text/html",
    parse: parseBingHtml,
  },
  {
    name: "DuckDuckGo",
    url: (query) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    accept: "text/html",
    parse: parseDuckDuckGoHtml,
  },
];

async function fetchProvider(
  provider: SearchProvider,
  query: string,
  options: Required<Pick<WebSearchOptions, "lang" | "fetchImpl" | "timeoutMs">> & Pick<WebSearchOptions, "signal">
): Promise<SearchEntry[]> {
  const standaloneController = new AbortController();
  const linked = options.signal ? createLinkedTimeoutSignal(options.signal, options.timeoutMs) : null;
  const timeout = linked ? null : setTimeout(() => standaloneController.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(provider.url(query, options.lang), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 ZNWriter/1.0",
        "Accept": provider.accept,
      },
      signal: linked?.signal || standaloneController.signal,
    });
    if (!response.ok) return [];
    return provider.parse(await response.text());
  } finally {
    linked?.cleanup();
    if (timeout) clearTimeout(timeout);
  }
}

function formatResults(query: string, provider: string, entries: SearchEntry[], lang: string): string {
  const rows = entries.map((entry, index) => [
    `${index + 1}. ${entry.title}`,
    entry.snippet ? `   ${t(lang, "摘要", "Snippet")}: ${entry.snippet}` : "",
    `   ${t(lang, "链接", "URL")}: ${entry.url}`,
  ].filter(Boolean).join("\n"));
  return t(
    lang,
    `「${query}」的联网搜索结果（来源：${provider}）：\n${rows.join("\n")}`,
    `Web search results for "${query}" (source: ${provider}):\n${rows.join("\n")}`
  );
}

export async function searchWeb(query: string, options: WebSearchOptions = {}): Promise<string> {
  const lang = options.lang || "zh";
  const normalizedQuery = String(query || "").trim().slice(0, 300);
  if (!normalizedQuery) return t(lang, "未提供可搜索的关键词。", "No search query was provided.");

  const cacheKey = `${lang}:${normalizedQuery.toLowerCase()}`;
  const cached = webSearchCache.get(cacheKey);
  if (cached) return cached;

  const requestOptions = {
    lang,
    signal: options.signal,
    fetchImpl: options.fetchImpl || fetch,
    timeoutMs: options.timeoutMs || 12_000,
  };

  for (const provider of providers) {
    if (options.signal?.aborted) throw options.signal.reason || new DOMException("Aborted", "AbortError");
    try {
      const entries = await fetchProvider(provider, normalizedQuery, requestOptions);
      if (entries.length === 0) continue;
      const formatted = formatResults(normalizedQuery, provider.name, entries, lang);
      webSearchCache.set(cacheKey, formatted);
      return formatted;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      console.warn(`[web-search] ${provider.name} unavailable:`, error instanceof Error ? error.message : error);
    }
  }

  return t(
    lang,
    `联网搜索「${normalizedQuery}」失败：可用搜索源均未返回结果。请如实告诉用户暂时无法核实最新信息。`,
    `Web search for "${normalizedQuery}" failed because no available source returned results. Be honest that the latest information could not be verified.`
  );
}
