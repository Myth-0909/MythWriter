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
  docCount?: number;
  docWords?: number;
  journalCount?: number;
  journalWords?: number;
  totalWords?: number;
};

function normalizeToolCallId(toolCall: AssistantToolCall | undefined, index: number): string {
  const id = String(toolCall?.id || "").trim();
  return id || `call_${index}`;
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
  const docMatch = content.match(/修改文档\s*([\d,]+)\s*篇，新增\s*([\d,]+)\s*字/);
  const journalMatch = content.match(/随记\s*([\d,]+)\s*条，共\s*([\d,]+)\s*字/);
  return {
    date: content.match(/今日写作统计（([^）]+)）/)?.[1],
    docCount: parseNumber(docMatch?.[1]),
    docWords: parseNumber(docMatch?.[2]),
    journalCount: parseNumber(journalMatch?.[1]),
    journalWords: parseNumber(journalMatch?.[2]),
    totalWords: matchNumber(content, /合计\s*([\d,]+)\s*字/),
  };
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

  const lines: string[] = [];
  if (today) {
    const total = today.totalWords ?? (today.docWords ?? 0) + (today.journalWords ?? 0);
    lines.push(t(
      lang,
      `- 今天（${today.date || "今日"}）：修改 ${formatNumber(today.docCount)} 篇文档，文档新增 ${formatNumber(today.docWords)} 字；随记 ${formatNumber(today.journalCount)} 条，共 ${formatNumber(today.journalWords)} 字；合计 ${formatNumber(total)} 字。`,
      `- Today (${today.date || "today"}): ${formatNumber(today.docCount)} documents edited, ${formatNumber(today.docWords)} document words; ${formatNumber(today.journalCount)} journal entries, ${formatNumber(today.journalWords)} words; ${formatNumber(total)} words in total.`
    ));
  }

  if (stats) {
    lines.push(t(
      lang,
      `- 工作区：目前有 ${formatNumber(stats.docCount)} 篇文档、${formatNumber(stats.journalCount)} 条随记、${formatNumber(stats.groupCount)} 个文档分组、${formatNumber(stats.brainCount)} 条脑库设定；随记累计 ${formatNumber(stats.journalWords)} 字。`,
      `- Workspace: ${formatNumber(stats.docCount)} documents, ${formatNumber(stats.journalCount)} journal entries, ${formatNumber(stats.groupCount)} groups, and ${formatNumber(stats.brainCount)} brain settings; journal entries total ${formatNumber(stats.journalWords)} words.`
    ));
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
  const resultIndexes = new Set(toolResults.map((result, fallbackIndex) => (
    Number.isInteger(result.index) ? result.index : fallbackIndex
  )));
  const includedToolCalls = toolCalls
    .map((toolCall, index) => ({ toolCall, index }))
    .filter(({ index }) => resultIndexes.has(index));
  const assistantMessage: ToolFollowUpMessage = {
    role: "assistant",
    content: "",
    tool_calls: includedToolCalls.map(({ toolCall, index }) => ({
      id: normalizeToolCallId(toolCall, index),
      type: "function",
      function: {
        name: toolCall.name,
        arguments: toolCall.arguments || "{}",
      },
    })),
  };

  const resultMessages = toolResults.map((result, fallbackIndex) => {
    const index = Number.isInteger(result.index) ? result.index : fallbackIndex;
    return {
      role: "tool" as const,
      tool_call_id: normalizeToolCallId(toolCalls[index], index),
      content: result.content,
    };
  });

  return [assistantMessage, ...resultMessages];
}
