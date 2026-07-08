import { t } from "../lib/i18n";

export type AssistantToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AssistantToolResult = {
  index: number;
  name: string;
  status: string;
  result?: string;
  content: string;
};

export type ToolFollowUpMessage =
  | {
      role: "assistant";
      content: string;
      tool_calls: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

type ParsedUserStats = {
  docCount?: number;
  journalCount?: number;
  journalWords?: number;
  groupCount?: number;
  brainCount?: number;
};

type ParsedTodayWriting = {
  date?: string;
  createdDocCount?: number;
  docCount?: number;
  docWords?: number;
  journalCount?: number;
  journalWords?: number;
  totalWords?: number;
};

type ParsedRecentDocument = {
  title: string;
  words?: number;
  date?: string;
};

function normalizeToolCallId(toolCall: AssistantToolCall | undefined, index: number): string {
  const id = String(toolCall?.id || "").trim();
  return id || `call_${index}`;
}

function parseAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

function normalizeToolArguments(value: string | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "{}";
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    return "{}";
  }
}

const DSML_OPEN_ANGLE = ["<", "＜"];
const DSML_CLOSE_ANGLE = [">", "＞"];
const DSML_PIPE_PAIRS = ["|", "||", "｜", "｜｜"];

function buildDsmlToolMarkers(closing: boolean): string[] {
  return DSML_OPEN_ANGLE.flatMap((open) => (
    DSML_CLOSE_ANGLE.flatMap((close) => (
      DSML_PIPE_PAIRS.map((pipes) => `${open}${closing ? "/" : ""}${pipes}DSML${pipes}tool_calls${close}`)
    ))
  ));
}

const DSML_TOOL_START_MARKERS = buildDsmlToolMarkers(false);
const DSML_TOOL_END_PATTERN = /[<＜]\s*\/\s*[|｜]{1,2}\s*DSML\s*[|｜]{1,2}\s*tool_calls\s*[>＞]\s*$/;
const DSML_TOOL_BLOCK_PATTERN = /[<＜]\s*[|｜]{1,2}\s*DSML\s*[|｜]{1,2}\s*tool_calls\s*[>＞]([\s\S]*?)(?:[<＜]\s*\/\s*[|｜]{1,2}\s*DSML\s*[|｜]{1,2}\s*tool_calls\s*[>＞]|$)/g;
const DSML_INVOKE_PATTERN = /[<＜]\s*[|｜]{1,2}\s*DSML\s*[|｜]{1,2}\s*invoke\b([^>＞]*)[>＞]([\s\S]*?)(?:[<＜]\s*\/\s*[|｜]{1,2}\s*DSML\s*[|｜]{1,2}\s*invoke\s*[>＞]|(?=[<＜]\s*[|｜]{1,2}\s*DSML\s*[|｜]{1,2}\s*invoke\b)|$)/g;

export function isDsmlToolCallStartPrefix(value: string): boolean {
  if (!value) return false;
  return DSML_TOOL_START_MARKERS.some((marker) => marker.startsWith(value));
}

export function isDsmlToolCallStart(value: string): boolean {
  return DSML_TOOL_START_MARKERS.includes(value);
}

export function endsWithDsmlToolCallEnd(value: string): boolean {
  return DSML_TOOL_END_PATTERN.test(value);
}

export function extractDsmlToolCalls(content: string): { cleanContent: string; toolCalls: AssistantToolCall[] } {
  const toolCalls: AssistantToolCall[] = [];
  const cleanContent = content.replace(DSML_TOOL_BLOCK_PATTERN, (_block, body: string) => {
    for (const invoke of String(body || "").matchAll(DSML_INVOKE_PATTERN)) {
      const attrs = parseAttributes(invoke[1] || "");
      const name = String(attrs.name || "").trim();
      if (!name) continue;
      const argumentValue = attrs.arguments || attrs.args || invoke[2];
      toolCalls.push({
        id: attrs.id || "",
        name,
        arguments: normalizeToolArguments(argumentValue),
      });
    }
    return "";
  }).trim();
  return { cleanContent, toolCalls };
}

export function shouldPreferTodayWritingTool(content: string): boolean {
  const normalized = String(content || "").toLowerCase().replace(/\s+/g, "");
  if (!normalized) return false;
  const asksToday = /今天|今日|本日|today/.test(normalized);
  const asksCount = /多少|几|一共|总共|合计|howmany|count/.test(normalized);
  const mentionsWritingArtifact = /文章|文档|稿件|篇|article|document|doc|piece/.test(normalized);
  const mentionsTodayActivity = /生成|创建|新建|写了|写作|产出|更新|create|created|generate|generated|write|wrote|written|touch|touched/.test(normalized);
  return asksToday && asksCount && mentionsWritingArtifact && mentionsTodayActivity;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function formatNumber(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "0";
}

function matchNumber(content: string, pattern: RegExp): number | undefined {
  return parseNumber(content.match(pattern)?.[1]);
}

function parseUserStats(content: string): ParsedUserStats | null {
  if (!content.includes("用户工作区统计")) return null;
  return {
    docCount: matchNumber(content, /文档总数：\s*([\d,]+)\s*篇/),
    journalCount: matchNumber(content, /随记总数：\s*([\d,]+)\s*条/),
    journalWords: matchNumber(content, /随记总字数：\s*([\d,]+)\s*字/),
    groupCount: matchNumber(content, /文档分组：\s*([\d,]+)\s*个/),
    brainCount: matchNumber(content, /脑库条目：\s*([\d,]+)\s*条/),
  };
}

function parseTodayWriting(content: string): ParsedTodayWriting | null {
  if (!content.includes("今日写作统计")) return null;
  const createdMatch = content.match(/今日新建文档\s*([\d,]+)\s*篇/);
  const docMatch =
    content.match(/今日更新文档\s*([\d,]+)\s*篇，当前共\s*([\d,]+)\s*字/) ||
    content.match(/修改文档\s*([\d,]+)\s*篇，新增\s*([\d,]+)\s*字/);
  const journalMatch =
    content.match(/今日随记\s*([\d,]+)\s*条，共\s*([\d,]+)\s*字/) ||
    content.match(/随记\s*([\d,]+)\s*条，共\s*([\d,]+)\s*字/);
  return {
    date: content.match(/今日写作统计（([^）]+)）/)?.[1],
    createdDocCount: parseNumber(createdMatch?.[1]),
    docCount: parseNumber(docMatch?.[1]),
    docWords: parseNumber(docMatch?.[2]),
    journalCount: parseNumber(journalMatch?.[1]),
    journalWords: parseNumber(journalMatch?.[2]),
    totalWords: matchNumber(content, /(?:可确认合计|合计)\s*([\d,]+)\s*字/),
  };
}

function parseRecentDocuments(content: string): ParsedRecentDocument[] {
  if (!content.includes("用户最近")) return [];
  return Array.from(content.matchAll(/\d+\.\s*《([^》]+)》—\s*([\d,]+)\s*字，最后修改\s*([0-9-]+)/g))
    .slice(0, 3)
    .map((match) => ({
      title: match[1],
      words: parseNumber(match[2]),
      date: match[3],
    }));
}

function writingStateLine(today: ParsedTodayWriting | null, lang: string): string {
  if (!today) return "";
  const total = today.totalWords ?? (today.docWords ?? 0) + (today.journalWords ?? 0);
  if (lang === "en") {
    if (total >= 1000) return "The pace is strong today; keep this session open while the momentum is still warm.";
    if (total >= 300) return "You have a steady writing rhythm today; one more small pass would turn it into a solid session.";
    if (total > 0) return "You have started lightly today; it is a good moment to add one short note or one focused paragraph.";
    return "No new writing is recorded today yet; start with a tiny 100-word draft or a quick journal note.";
  }
  if (total >= 1000) return "今天产出很扎实，建议趁手感还在继续推进一小段。";
  if (total >= 300) return "今天已经进入稳定推进状态，再补一轮会更完整。";
  if (total > 0) return "今天有轻量推进，可以用一段随记或一个小段落把状态接住。";
  return "今天还没有记录到新的写作产出，可以先用 100 字草稿或一条随记启动。";
}

function buildKnownToolLines(results: AssistantToolResult[], lang: string): string[] {
  const stats = results
    .map((result) => parseUserStats(result.content))
    .find((parsed): parsed is ParsedUserStats => Boolean(parsed));
  const today = results
    .map((result) => parseTodayWriting(result.content))
    .find((parsed): parsed is ParsedTodayWriting => Boolean(parsed));
  const recentDocs = results.flatMap((result) => parseRecentDocuments(result.content));

  const lines: string[] = [];
  if (today) {
    const total = today.totalWords ?? (today.docWords ?? 0) + (today.journalWords ?? 0);
    const createdDocLine = today.createdDocCount !== undefined
      ? `今日新建文档 ${formatNumber(today.createdDocCount)} 篇；`
      : "";
    const createdDocLineEn = today.createdDocCount !== undefined
      ? `${formatNumber(today.createdDocCount)} documents created today; `
      : "";
    lines.push(t(
      lang,
      `- 今天（${today.date || "今日"}）：${createdDocLine}今日更新文档 ${formatNumber(today.docCount)} 篇，当前共 ${formatNumber(today.docWords)} 字；今日随记 ${formatNumber(today.journalCount)} 条，共 ${formatNumber(today.journalWords)} 字；可确认合计 ${formatNumber(total)} 字。`,
      `- Today (${today.date || "today"}): ${createdDocLineEn}${formatNumber(today.docCount)} documents touched, currently ${formatNumber(today.docWords)} document words; ${formatNumber(today.journalCount)} journal entries, ${formatNumber(today.journalWords)} words; ${formatNumber(total)} confirmed words in touched items.`
    ));
  }

  if (stats) {
    lines.push(t(
      lang,
      `- 工作区：目前有 ${formatNumber(stats.docCount)} 篇文档、${formatNumber(stats.journalCount)} 条随记、${formatNumber(stats.groupCount)} 个文档分组、${formatNumber(stats.brainCount)} 条脑库设定；随记累计 ${formatNumber(stats.journalWords)} 字。`,
      `- Workspace: ${formatNumber(stats.docCount)} documents, ${formatNumber(stats.journalCount)} journal entries, ${formatNumber(stats.groupCount)} groups, and ${formatNumber(stats.brainCount)} brain settings; journal entries total ${formatNumber(stats.journalWords)} words.`
    ));
  }

  if (recentDocs.length > 0) {
    const recentSummary = recentDocs
      .map((doc) => t(
        lang,
        `《${doc.title}》${doc.words !== undefined ? ` ${formatNumber(doc.words)} 字` : ""}${doc.date ? `（${doc.date}）` : ""}`,
        `"${doc.title}"${doc.words !== undefined ? ` ${formatNumber(doc.words)} words` : ""}${doc.date ? ` (${doc.date})` : ""}`
      ))
      .join("、");
    lines.push(t(lang, `- 最近文档：${recentSummary}。`, `- Recent documents: ${recentSummary}.`));
  }

  if (today) {
    lines.push(t(lang, `- 状态判断：${writingStateLine(today, lang)}`, `- Read: ${writingStateLine(today, lang)}`));
  }

  return lines;
}

function buildGenericToolLines(results: AssistantToolResult[], lang: string): string[] {
  return results
    .filter((result) => result.content.trim())
    .slice(0, 4)
    .map((result) => {
      const content = result.content.trim().replace(/\n{3,}/g, "\n\n");
      const label = result.name || t(lang, "工具", "Tool");
      return `- ${label}: ${content.slice(0, 700)}`;
    });
}

export function buildToolResultSummary(result: AssistantToolResult, lang: string): string {
  if (result.status === "error") {
    return t(lang, "执行失败", "Failed");
  }

  const stats = parseUserStats(result.content);
  if (stats) {
    return t(
      lang,
      `文档 ${formatNumber(stats.docCount)} 篇 · 随记 ${formatNumber(stats.journalCount)} 条 · 脑库 ${formatNumber(stats.brainCount)} 条`,
      `${formatNumber(stats.docCount)} docs · ${formatNumber(stats.journalCount)} journals · ${formatNumber(stats.brainCount)} brain notes`
    );
  }

  const today = parseTodayWriting(result.content);
  if (today) {
    const total = today.totalWords ?? (today.docWords ?? 0) + (today.journalWords ?? 0);
    const createdDocPart = today.createdDocCount !== undefined
      ? t(lang, ` · 新建 ${formatNumber(today.createdDocCount)} 篇`, ` · ${formatNumber(today.createdDocCount)} created`)
      : "";
    return t(
      lang,
      `今日 ${formatNumber(total)} 字${createdDocPart} · 文档 ${formatNumber(today.docCount)} 篇 · 随记 ${formatNumber(today.journalCount)} 条`,
      `${formatNumber(total)} words today${createdDocPart} · ${formatNumber(today.docCount)} docs · ${formatNumber(today.journalCount)} journals`
    );
  }

  const recentDocs = parseRecentDocuments(result.content);
  if (recentDocs.length > 0) {
    const titles = recentDocs.map((doc) => t(lang, `《${doc.title}》`, `"${doc.title}"`)).join("、");
    return t(lang, `最近文档 ${titles}`, `Recent documents ${titles}`);
  }

  const compact = (result.result || result.content)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 90);
  return compact || t(lang, "已完成", "Done");
}

function collectEvidenceTokens(results: AssistantToolResult[]): string[] {
  return results.flatMap((result) => {
    const numericTokens = result.content.match(/\d[\d,]*/g) || [];
    const titleTokens = Array.from(result.content.matchAll(/《([^》]+)》/g)).map((match) => match[1]);
    const resultTokens = result.result ? [result.result] : [];
    return [...numericTokens, ...titleTokens, ...resultTokens]
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length >= 2);
  });
}

function hasCountWithWritingUnit(reply: string, count: number | undefined): boolean {
  if (count === undefined) return true;
  const compact = reply.replace(/\s+/g, "").toLowerCase();
  const variants = Array.from(new Set([
    String(count),
    formatNumber(count),
    formatNumber(count).replace(/,/g, ""),
  ])).filter(Boolean).map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const zhUnit = "(?:文档|文章|稿件|篇)";
  const enUnit = "(?:docs?|documents?|articles?|pieces?)";
  return variants.some((value) => (
    new RegExp(`(?:${zhUnit})[^\\d]{0,8}${value}(?:篇|个)?`).test(compact) ||
    new RegExp(`${value}(?:篇|个)?[^\\d]{0,8}(?:${zhUnit})`).test(compact) ||
    new RegExp(`(?:${enUnit})[^\\d]{0,8}${value}`).test(compact) ||
    new RegExp(`${value}[^\\d]{0,8}(?:${enUnit})`).test(compact)
  ));
}

function missesRequiredTodayWritingCount(reply: string, results: AssistantToolResult[]): boolean {
  const today = results
    .map((result) => parseTodayWriting(result.content))
    .find((parsed): parsed is ParsedTodayWriting => Boolean(parsed));
  if (!today) return false;
  return !hasCountWithWritingUnit(reply, today.docCount);
}

export function shouldUseToolFallbackReply(reply: string, results: AssistantToolResult[]): boolean {
  const normalized = reply.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return true;
  if (results.length === 0) return false;

  if (missesRequiredTodayWritingCount(reply, results)) return true;

  const hasConcreteEvidence = collectEvidenceTokens(results).some((token) => normalized.includes(token));
  if (hasConcreteEvidence) return false;

  return [
    /请查看结果/,
    /查看结果/,
    /已完成操作\s*[（(]/,
    /completed\s*[（(]/i,
    /please\s+(check|see|view)\s+(the\s+)?results?/i,
    /operation[s]?\s+completed/i,
  ].some((pattern) => pattern.test(reply));
}

export function buildToolFallbackReply(results: AssistantToolResult[], lang: string): string {
  const successfulResults = results.filter((result) => result.status !== "error" && result.content.trim());
  if (successfulResults.length === 0) {
    return t(
      lang,
      "工具已经执行完成，但没有拿到足够可分析的数据。你可以换个问法，或让我再查一次更具体的范围。",
      "The tool finished, but there was not enough data to analyze. Try a more specific question or ask me to check again."
    );
  }

  const lines = buildKnownToolLines(successfulResults, lang);
  const finalLines = lines.length > 0 ? lines : buildGenericToolLines(successfulResults, lang);
  const intro = t(lang, "我查到这些数据，先给你一个直接结论：", "I found the data. Here's the direct read:");
  const followUp = t(
    lang,
    "如果你愿意，我也可以继续帮你拆成周报、趋势或下一步写作建议。",
    "I can also turn this into a weekly review, trend read, or next writing suggestion."
  );

  return [intro, ...finalLines, followUp].join("\n");
}

export function buildToolFollowUpMessages(
  toolCalls: AssistantToolCall[],
  toolResults: AssistantToolResult[]
): ToolFollowUpMessage[] {
  const includedResults = toolResults
    .map((result, fallbackIndex) => {
      const index = Number.isInteger(result.index) ? result.index : fallbackIndex;
      return { result, index, toolCall: toolCalls[index] };
    })
    .filter((entry): entry is { result: AssistantToolResult; index: number; toolCall: AssistantToolCall } => (
      Boolean(entry.toolCall?.name)
    ));
  const assistantMessage: ToolFollowUpMessage = {
    role: "assistant",
    content: "",
    tool_calls: includedResults.map(({ toolCall, index }) => ({
      id: normalizeToolCallId(toolCall, index),
      type: "function",
      function: {
        name: toolCall.name,
        arguments: toolCall.arguments || "{}",
      },
    })),
  };

  const resultMessages = includedResults.map(({ result, index, toolCall }) => {
    return {
      role: "tool" as const,
      tool_call_id: normalizeToolCallId(toolCall, index),
      content: result.content,
    };
  });

  return [assistantMessage, ...resultMessages];
}
