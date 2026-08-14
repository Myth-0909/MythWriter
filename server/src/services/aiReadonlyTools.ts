import prisma from "../lib/prisma";
import { t } from "../lib/i18n";
import { ragService } from "./ragService";
import { formatLocalDateKey, getLocalCalendarWeekRange, getLocalDayRange } from "./writingStats";
import { normalizeTargetDate, type WorkRecordPeriod } from "./workRecordSummaryService";
import type { AssistantToolCall, AssistantToolResult } from "./aiToolConversation";
import { buildSpreadsheetPreview, normalizeSpreadsheetWorkbook, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./spreadsheetWorkbook";

type ReadonlyToolDeps = {
  prisma: any;
  ragService: {
    searchDocuments: (userId: string, query: string, topK?: number) => Promise<{ results: any[]; degraded: boolean; error?: string }>;
    searchKnowledge: (userId: string, query: string, topK?: number, fallbackLoader?: () => Promise<any[]>) => Promise<{ results: any[]; degraded: boolean; error?: string }>;
  };
  now?: () => Date;
};

type ExecuteReadonlyToolParams = {
  userId: string;
  userLang: string;
  deps?: ReadonlyToolDeps;
};

const defaultDeps: ReadonlyToolDeps = {
  prisma,
  ragService,
  now: () => new Date(),
};

const READONLY_TOOL_NAMES = new Set([
  "get_user_stats",
  "list_documents",
  "get_document_summary",
  "search_documents",
  "list_spreadsheets",
  "get_spreadsheet_summary",
  "search_spreadsheets",
  "list_recent_documents",
  "list_favorite_documents",
  "list_trashed_documents",
  "get_today_writing",
  "get_writing_range_stats",
  "get_weekly_writing_stats",
  "list_work_records",
  "get_current_work_record",
  "list_document_groups",
  "list_document_versions",
  "list_brain_knowledge",
  "search_brain_knowledge",
  "list_brain_categories",
  "search_document_semantic",
  "search_knowledge_semantic",
  "get_rag_status",
]);

export function isReadonlyChatTool(name: string): boolean {
  return READONLY_TOOL_NAMES.has(name);
}

function parseArgs(value: string | undefined): Record<string, any> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function clamp(value: unknown, fallback: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.round(numeric)));
}

function stripHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string | null | undefined): number {
  return stripHtml(value).replace(/\s+/g, "").length;
}

function documentWordCount(doc: { wordCount?: number | null; content?: string | null }): number {
  if (typeof doc.wordCount === "number" && Number.isFinite(doc.wordCount)) {
    return Math.max(0, Math.round(doc.wordCount));
  }
  return wordCount(doc.content);
}

function dateKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function excerpt(value: string | null | undefined, length = 140): string {
  const text = stripHtml(value);
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function boolText(lang: string, value: boolean): string {
  return value ? t(lang, "是", "Yes") : t(lang, "否", "No");
}

function compactDocLine(doc: any, index: number, lang: string): string {
  const flags = [
    doc.isFavorite ? t(lang, "收藏", "favorite") : "",
    doc.isDeleted ? t(lang, "回收站", "trash") : "",
  ].filter(Boolean).join(t(lang, "，", ", "));
  const meta = [
    t(lang, `${documentWordCount(doc)} 字`, `${documentWordCount(doc)} words`),
    doc.category ? t(lang, `分类 ${doc.category}`, `category ${doc.category}`) : "",
    flags,
    t(lang, `更新 ${dateKey(doc.updatedAt)}`, `updated ${dateKey(doc.updatedAt)}`),
  ].filter(Boolean).join(t(lang, "，", ", "));
  return t(lang, `${index + 1}. 《${doc.title}》— ${meta}`, `${index + 1}. "${doc.title}" - ${meta}`);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function spreadsheetCellCount(workbook: SpreadsheetWorkbook): number {
  return workbook.sheets.reduce((total, sheet) => (
    total + sheet.data.reduce((rowTotal, row) => rowTotal + row.filter((cell) => cellText(cell)).length, 0)
  ), 0);
}

function sheetUsedSize(sheet: SpreadsheetSheet): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  sheet.data.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (!cellText(cell)) return;
      rows = Math.max(rows, rowIndex + 1);
      cols = Math.max(cols, colIndex + 1);
    });
  });
  return { rows, cols };
}

function compactSpreadsheetLine(spreadsheet: any, index: number, lang: string): string {
  const workbook = normalizeSpreadsheetWorkbook(spreadsheet.data);
  const preview = excerpt(spreadsheet.preview || buildSpreadsheetPreview(workbook), 90);
  const cellCount = spreadsheetCellCount(workbook);
  const meta = [
    t(lang, `${workbook.sheets.length} 个工作表`, `${workbook.sheets.length} sheet(s)`),
    t(lang, `${cellCount} 个非空单元格`, `${cellCount} non-empty cell(s)`),
    t(lang, `更新 ${dateKey(spreadsheet.updatedAt)}`, `updated ${dateKey(spreadsheet.updatedAt)}`),
    preview ? t(lang, `预览：${preview}`, `preview: ${preview}`) : "",
  ].filter(Boolean).join(t(lang, "，", ", "));
  return t(lang, `${index + 1}. 《${spreadsheet.title}》— ${meta}`, `${index + 1}. "${spreadsheet.title}" - ${meta}`);
}

function formatSpreadsheetSample(workbook: SpreadsheetWorkbook, lang: string): string {
  const sections: string[] = [];
  for (const sheet of workbook.sheets.slice(0, 4)) {
    const used = sheetUsedSize(sheet);
    const rows = sheet.data
      .map((row, index) => {
        const values = row.slice(0, 8).map(cellText);
        if (!values.some(Boolean)) return "";
        return `${index + 1}: ${values.join(" | ")}`;
      })
      .filter(Boolean)
      .slice(0, 8);
    sections.push(t(
      lang,
      `工作表「${sheet.name}」：${used.rows} 行 x ${used.cols} 列，样例：\n${rows.join("\n") || "暂无非空单元格"}`,
      `Sheet "${sheet.name}": ${used.rows} rows x ${used.cols} cols, sample:\n${rows.join("\n") || "No non-empty cells."}`
    ));
  }
  return sections.join("\n\n");
}

function spreadsheetSearchText(spreadsheet: any): string {
  const workbook = normalizeSpreadsheetWorkbook(spreadsheet.data);
  return [
    spreadsheet.title,
    spreadsheet.preview,
    buildSpreadsheetPreview(workbook),
    ...workbook.sheets.flatMap((sheet) => [
      sheet.name,
      ...sheet.data.flatMap((row) => row.map(cellText)),
    ]),
  ].filter(Boolean).join(" ").toLowerCase();
}

async function findDocument(deps: ReadonlyToolDeps, userId: string, args: Record<string, any>) {
  const id = String(args.id || "").trim();
  const title = String(args.title || "").trim();
  if (id) {
    return deps.prisma.document.findFirst({ where: { id, userId } });
  }
  if (title) {
    return deps.prisma.document.findFirst({
      where: {
        userId,
        isDeleted: false,
        OR: [
          { title },
          { title: { contains: title } },
        ],
      },
    });
  }
  return null;
}

async function findSpreadsheet(deps: ReadonlyToolDeps, userId: string, args: Record<string, any>) {
  const id = String(args.id || "").trim();
  const title = String(args.title || "").trim();
  if (id) {
    return deps.prisma.spreadsheet.findFirst({ where: { id, userId, isDeleted: false } });
  }
  if (title) {
    return deps.prisma.spreadsheet.findFirst({
      where: {
        userId,
        isDeleted: false,
        OR: [
          { title },
          { title: { contains: title } },
        ],
      },
    });
  }
  return null;
}

function makeResult(name: string, status: "done" | "error", content: string, result?: string): AssistantToolResult {
  return { index: 0, name, status, result, content };
}

async function listDocumentsByWhere(deps: ReadonlyToolDeps, userId: string, name: string, where: Record<string, any>, args: Record<string, any>, headingZh: string, headingEn: string, lang: string) {
  const limit = clamp(args.limit, name === "list_recent_documents" ? 5 : 10, name === "list_recent_documents" ? 10 : 20);
  const docs = await deps.prisma.document.findMany({
    where: { userId, ...where },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  const lines = docs.map((doc: any, index: number) => compactDocLine(doc, index, lang));
  return makeResult(
    name,
    "done",
    t(lang, `${headingZh}（${docs.length} 篇）：\n${lines.join("\n") || "暂无文档"}`, `${headingEn} (${docs.length} documents):\n${lines.join("\n") || "No documents."}`),
    `${docs.length} docs`
  );
}

async function getTodayWriting(deps: ReadonlyToolDeps, userId: string, name: string, lang: string) {
  const range = getLocalDayRange(deps.now?.() || new Date());
  const todayStr = formatLocalDateKey(range.start);
  // WorkRecord.targetDate is DateTime (UTC date-only). Never pass a YYYY-MM-DD string —
  // Prisma rejects it and the tool surfaces as a failed call in chat.
  const todayTargetDate = normalizeTargetDate("daily", todayStr);
  const [createdDocCount, updatedDocCount, todayJournals, dayStat] = await Promise.all([
    deps.prisma.document.count({
      where: { userId, isDeleted: false, createdAt: { gte: range.start, lt: range.end } },
    }),
    deps.prisma.document.count({
      where: { userId, isDeleted: false, updatedAt: { gte: range.start, lt: range.end } },
    }),
    deps.prisma.workRecord.findMany({
      where: { userId, period: "daily", targetDate: todayTargetDate },
      select: { id: true },
    }),
    deps.prisma.writingDayStat?.findUnique
      ? deps.prisma.writingDayStat.findUnique({
          where: { userId_dateKey: { userId, dateKey: todayStr } },
          select: { documentWords: true, journalWords: true },
        })
      : Promise.resolve(null),
  ]);
  const docWords = Number(dayStat?.documentWords) || 0;
  const journalWords = Number(dayStat?.journalWords) || 0;
  return makeResult(
    name,
    "done",
    t(
      lang,
      `今日写作统计（${todayStr}）：\n- 今日新建文档 ${createdDocCount} 篇\n- 今日更新文档 ${updatedDocCount} 篇，新增 ${docWords} 字\n- 今日随记 ${todayJournals.length} 条，新增 ${journalWords} 字\n- 今日新增合计 ${docWords + journalWords} 字`,
      `Today's writing (${todayStr}):\n- ${createdDocCount} documents created today\n- ${updatedDocCount} documents updated today, ${docWords} words added\n- ${todayJournals.length} work records today, ${journalWords} words added\n- Total words added today: ${docWords + journalWords}`
    ),
    `${createdDocCount} docs created, ${updatedDocCount} docs touched, ${todayJournals.length} journals, ${docWords + journalWords} words added today`
  );
}

async function getWritingRangeStats(deps: ReadonlyToolDeps, userId: string, name: string, args: Record<string, any>, lang: string) {
  const useCalendarWeek = name === "get_weekly_writing_stats";
  const days = useCalendarWeek ? 7 : clamp(args.days, 7, 31);
  const now = deps.now?.() || new Date();
  const week = useCalendarWeek ? getLocalCalendarWeekRange(now) : null;
  const dateKeys = week
    ? week.days
    : (() => {
        const end = getLocalDayRange(now).end;
        const keys: string[] = [];
        for (let i = days - 1; i >= 0; i -= 1) {
          const day = new Date(end);
          day.setDate(end.getDate() - i - 1);
          keys.push(formatLocalDateKey(day));
        }
        return keys;
      })();

  let byDate = new Map<string, { documentWords: number; journalWords: number }>();
  if (deps.prisma.writingDayStat?.findMany) {
    const rows = await deps.prisma.writingDayStat.findMany({
      where: { userId, dateKey: { in: dateKeys } },
      select: { dateKey: true, documentWords: true, journalWords: true },
    });
    byDate = new Map(rows.map((row: any) => [row.dateKey, {
      documentWords: Number(row.documentWords) || 0,
      journalWords: Number(row.journalWords) || 0,
    }]));
  }

  const heading = useCalendarWeek
    ? t(lang, `本周写作统计（${dateKeys[0]} ~ ${dateKeys[dateKeys.length - 1]}）`, `This week's writing (${dateKeys[0]} ~ ${dateKeys[dateKeys.length - 1]})`)
    : t(lang, `近 ${days} 天写作统计`, `Writing stats for the last ${days} days`);

  const lines = dateKeys.map((key) => {
    const item = byDate.get(key) || { documentWords: 0, journalWords: 0 };
    return t(
      lang,
      `- ${key}：文档新增 ${item.documentWords} 字，随记新增 ${item.journalWords} 字`,
      `- ${key}: ${item.documentWords} document words added, ${item.journalWords} journal words added`
    );
  });
  return makeResult(name, "done", `${heading}：\n${lines.join("\n")}`, `${dateKeys.length} days writing stats`);
}

export async function executeReadonlyChatTool(
  toolCall: Pick<AssistantToolCall, "name" | "arguments">,
  params: ExecuteReadonlyToolParams
): Promise<AssistantToolResult> {
  const name = String(toolCall.name || "").trim();
  const args = parseArgs(toolCall.arguments);
  const deps = params.deps || defaultDeps;
  const userId = params.userId;
  const lang = params.userLang;

  if (!isReadonlyChatTool(name)) {
    return makeResult(
      name,
      "error",
      t(params.userLang, `Error: ${name || "unknown"} 不是可直接执行的只读工具，需要显式确认或暂不支持直接执行。`, `Error: ${name || "unknown"} is not an executable read-only tool. It requires explicit confirmation or is not directly supported.`),
      t(params.userLang, "只读工具不可执行该操作", "Read-only tool cannot execute this action")
    );
  }

  if (name === "get_user_stats") {
    const [docCount, journalCount, groupCount, brainCount] = await Promise.all([
      deps.prisma.document.count({ where: { userId, isDeleted: false } }),
      deps.prisma.workRecord.count({ where: { userId } }),
      deps.prisma.documentGroup.count({ where: { userId } }),
      deps.prisma.aIBrainKnowledge.count({ where: { userId } }),
    ]);
    const records = await deps.prisma.workRecord.findMany({ where: { userId }, select: { content: true } });
    const totalJournalWords = records.reduce((sum: number, record: any) => sum + wordCount(record.content), 0);
    return makeResult(
      name,
      "done",
      t(
        lang,
        `用户工作区统计：\n- 文档总数：${docCount} 篇\n- 随记总数：${journalCount} 条\n- 随记总字数：${totalJournalWords} 字\n- 文档分组：${groupCount} 个\n- 脑库条目：${brainCount} 条`,
        `Workspace stats:\n- Documents: ${docCount}\n- Work records: ${journalCount}\n- Work record words: ${totalJournalWords}\n- Document groups: ${groupCount}\n- Brain knowledge entries: ${brainCount}`
      ),
      `${docCount} docs, ${journalCount} journals`
    );
  }

  if (name === "list_documents") return listDocumentsByWhere(deps, userId, name, { isDeleted: false }, args, "用户文档列表", "Document list", lang);
  if (name === "list_spreadsheets") {
    const limit = clamp(args.limit, 10, 20);
    const spreadsheets = await deps.prisma.spreadsheet.findMany({
      where: { userId, isDeleted: false },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    const lines = spreadsheets.map((spreadsheet: any, index: number) => compactSpreadsheetLine(spreadsheet, index, lang));
    return makeResult(
      name,
      "done",
      t(lang, `用户表格列表（${spreadsheets.length} 个）：\n${lines.join("\n") || "暂无表格"}`, `Spreadsheet list (${spreadsheets.length} spreadsheets):\n${lines.join("\n") || "No spreadsheets."}`),
      `${spreadsheets.length} spreadsheets`
    );
  }
  if (name === "list_recent_documents") return listDocumentsByWhere(deps, userId, name, { isDeleted: false }, args, "用户最近文档", "Recent documents", lang);
  if (name === "list_favorite_documents") return listDocumentsByWhere(deps, userId, name, { isDeleted: false, isFavorite: true }, args, "用户收藏文档", "Favorite documents", lang);
  if (name === "list_trashed_documents") return listDocumentsByWhere(deps, userId, name, { isDeleted: true }, args, "用户回收站文档", "Trashed documents", lang);
  if (name === "get_today_writing") return getTodayWriting(deps, userId, name, lang);
  if (name === "get_writing_range_stats" || name === "get_weekly_writing_stats") {
    return getWritingRangeStats(deps, userId, name, { ...args, days: name === "get_weekly_writing_stats" ? 7 : args.days }, lang);
  }

  if (name === "get_document_summary") {
    const doc = await findDocument(deps, userId, args);
    if (!doc) return makeResult(name, "done", t(lang, "未找到匹配文档。", "No matching document found."), "0 docs");
    return makeResult(
      name,
      "done",
      t(
        lang,
        `文档摘要：\n- 标题：《${doc.title}》\n- 分类：${doc.category}\n- 字数：${documentWordCount(doc)} 字\n- 创建：${dateKey(doc.createdAt)}\n- 更新：${dateKey(doc.updatedAt)}\n- 收藏：${boolText(lang, Boolean(doc.isFavorite))}\n- 摘要：${excerpt(doc.content)}`,
        `Document summary:\n- Title: "${doc.title}"\n- Category: ${doc.category}\n- Words: ${documentWordCount(doc)}\n- Created: ${dateKey(doc.createdAt)}\n- Updated: ${dateKey(doc.updatedAt)}\n- Favorite: ${boolText(lang, Boolean(doc.isFavorite))}\n- Excerpt: ${excerpt(doc.content)}`
      ),
      doc.title
    );
  }

  if (name === "search_documents") {
    const query = String(args.query || "").trim();
    const limit = clamp(args.limit, 5, 10);
    const docs = await deps.prisma.document.findMany({
      where: {
        userId,
        isDeleted: false,
        OR: [
          { title: { contains: query } },
          { preview: { contains: query } },
          { content: { contains: query } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    const lines = docs.map((doc: any, index: number) => compactDocLine(doc, index, lang));
    return makeResult(
      name,
      "done",
      t(lang, `文档搜索「${query}」命中 ${docs.length} 篇：\n${lines.join("\n") || "暂无匹配文档"}`, `Document search for "${query}" found ${docs.length} matches:\n${lines.join("\n") || "No matching documents."}`),
      `${docs.length} docs`
    );
  }

  if (name === "get_spreadsheet_summary") {
    const spreadsheet = await findSpreadsheet(deps, userId, args);
    if (!spreadsheet) return makeResult(name, "done", t(lang, "未找到匹配表格。", "No matching spreadsheet found."), "0 spreadsheets");
    const workbook = normalizeSpreadsheetWorkbook(spreadsheet.data);
    const sample = formatSpreadsheetSample(workbook, lang);
    return makeResult(
      name,
      "done",
      t(
        lang,
        `表格摘要：\n- 标题：《${spreadsheet.title}》\n- 工作表：${workbook.sheets.map((sheet) => sheet.name).join("、")}\n- 非空单元格：${spreadsheetCellCount(workbook)} 个\n- 创建：${dateKey(spreadsheet.createdAt)}\n- 更新：${dateKey(spreadsheet.updatedAt)}\n\n${sample}`,
        `Spreadsheet summary:\n- Title: "${spreadsheet.title}"\n- Sheets: ${workbook.sheets.map((sheet) => sheet.name).join(", ")}\n- Non-empty cells: ${spreadsheetCellCount(workbook)}\n- Created: ${dateKey(spreadsheet.createdAt)}\n- Updated: ${dateKey(spreadsheet.updatedAt)}\n\n${sample}`
      ),
      spreadsheet.title
    );
  }

  if (name === "search_spreadsheets") {
    const query = String(args.query || "").trim();
    const limit = clamp(args.limit, 5, 10);
    const candidates = await deps.prisma.spreadsheet.findMany({
      where: { userId, isDeleted: false },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const needle = query.toLowerCase();
    const spreadsheets = candidates
      .filter((spreadsheet: any) => spreadsheetSearchText(spreadsheet).includes(needle))
      .slice(0, limit);
    const lines = spreadsheets.map((spreadsheet: any, index: number) => compactSpreadsheetLine(spreadsheet, index, lang));
    return makeResult(
      name,
      "done",
      t(lang, `表格搜索「${query}」命中 ${spreadsheets.length} 个：\n${lines.join("\n") || "暂无匹配表格"}`, `Spreadsheet search for "${query}" found ${spreadsheets.length} matches:\n${lines.join("\n") || "No matching spreadsheets."}`),
      `${spreadsheets.length} spreadsheets`
    );
  }

  if (name === "list_work_records") {
    const period = ["daily", "weekly", "monthly"].includes(args.period) ? args.period : undefined;
    const records = await deps.prisma.workRecord.findMany({
      where: { userId, ...(period ? { period } : {}) },
      orderBy: { targetDate: "desc" },
      take: clamp(args.limit, 10, 20),
    });
    const lines = records.map((record: any, index: number) => (
      t(lang, `${index + 1}. ${dateKey(record.targetDate)} ${record.period}《${record.title}》— ${wordCount(record.content)} 字`, `${index + 1}. ${dateKey(record.targetDate)} ${record.period} "${record.title}" - ${wordCount(record.content)} words`)
    ));
    return makeResult(name, "done", t(lang, `随记/记录列表（${records.length} 条）：\n${lines.join("\n") || "暂无记录"}`, `Work records (${records.length}):\n${lines.join("\n") || "No records."}`), `${records.length} records`);
  }

  if (name === "get_current_work_record") {
    const period = String(args.period || "daily") as WorkRecordPeriod;
    const targetDate = normalizeTargetDate(period, args.targetDate);
    const record = await deps.prisma.workRecord.findMany({ where: { userId, period, targetDate }, take: 1 });
    const current = record[0];
    return makeResult(
      name,
      "done",
      current
        ? t(lang, `当前记录：\n- 日期：${dateKey(current.targetDate)}\n- 类型：${current.period}\n- 标题：${current.title}\n- 字数：${wordCount(current.content)} 字\n- 内容：${excerpt(current.content)}`, `Current record:\n- Date: ${dateKey(current.targetDate)}\n- Period: ${current.period}\n- Title: ${current.title}\n- Words: ${wordCount(current.content)}\n- Excerpt: ${excerpt(current.content)}`)
        : t(lang, "未找到当前记录。", "No current record found."),
      current ? current.title : "0 records"
    );
  }

  if (name === "list_document_groups") {
    const groups = await deps.prisma.documentGroup.findMany({
      where: { userId },
      include: { documents: { where: { isDeleted: false } } },
      orderBy: { createdAt: "desc" },
    });
    const lines = groups.map((group: any, index: number) => {
      const sampleZh = (group.documents || []).slice(0, 3).map((doc: any) => `《${doc.title}》`).join("、");
      const sampleEn = (group.documents || []).slice(0, 3).map((doc: any) => `"${doc.title}"`).join(", ");
      return t(lang, `${index + 1}. ${group.name}：${(group.documents || []).length} 篇${sampleZh}`, `${index + 1}. ${group.name}: ${(group.documents || []).length} documents ${sampleEn}`);
    });
    return makeResult(name, "done", t(lang, `文档分组（${groups.length} 个）：\n${lines.join("\n") || "暂无分组"}`, `Document groups (${groups.length}):\n${lines.join("\n") || "No groups."}`), `${groups.length} groups`);
  }

  if (name === "list_document_versions") {
    const doc = await findDocument(deps, userId, args);
    if (!doc) return makeResult(name, "done", t(lang, "未找到匹配文档，无法读取版本。", "No matching document found, so versions cannot be read."), "0 versions");
    const versions = await deps.prisma.documentVersion.findMany({
      where: { userId, documentId: doc.id },
      orderBy: { createdAt: "desc" },
      take: clamp(args.limit, 10, 20),
    });
    const lines = versions.map((version: any, index: number) => (
      t(lang, `${index + 1}. ${dateKey(version.createdAt)} ${version.source} — ${wordCount(version.content)} 字`, `${index + 1}. ${dateKey(version.createdAt)} ${version.source} - ${wordCount(version.content)} words`)
    ));
    return makeResult(name, "done", t(lang, `《${doc.title}》版本记录（${versions.length} 条）：\n${lines.join("\n") || "暂无版本记录"}`, `"${doc.title}" versions (${versions.length}):\n${lines.join("\n") || "No version records."}`), `${versions.length} versions`);
  }

  if (name === "list_brain_knowledge") {
    const category = String(args.category || "").trim();
    const entries = await deps.prisma.aIBrainKnowledge.findMany({
      where: { userId, ...(category ? { category } : {}) },
      orderBy: { createdAt: "desc" },
      take: clamp(args.limit, 10, 20),
    });
    const lines = entries.map((entry: any, index: number) => (
      t(lang, `${index + 1}. [${entry.category || "未分类"}] ${entry.title}：${excerpt(entry.description, 90)}`, `${index + 1}. [${entry.category || "Uncategorized"}] ${entry.title}: ${excerpt(entry.description, 90)}`)
    ));
    return makeResult(name, "done", t(lang, `脑库设定（${entries.length} 条）：\n${lines.join("\n") || "暂无设定"}`, `Brain knowledge (${entries.length}):\n${lines.join("\n") || "No knowledge entries."}`), `${entries.length} brain notes`);
  }

  if (name === "search_brain_knowledge") {
    const query = String(args.query || "").trim();
    const entries = await deps.prisma.aIBrainKnowledge.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query } },
          { category: { contains: query } },
          { description: { contains: query } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: clamp(args.limit, 5, 10),
    });
    const lines = entries.map((entry: any, index: number) => (
      t(lang, `${index + 1}. [${entry.category || "未分类"}] ${entry.title}：${excerpt(entry.description, 90)}`, `${index + 1}. [${entry.category || "Uncategorized"}] ${entry.title}: ${excerpt(entry.description, 90)}`)
    ));
    return makeResult(name, "done", t(lang, `脑库搜索「${query}」命中 ${entries.length} 条：\n${lines.join("\n") || "暂无匹配设定"}`, `Brain knowledge search for "${query}" found ${entries.length} matches:\n${lines.join("\n") || "No matching knowledge entries."}`), `${entries.length} brain notes`);
  }

  if (name === "list_brain_categories") {
    const categories = await deps.prisma.aIBrainCategory.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } });
    const entries = await deps.prisma.aIBrainKnowledge.findMany({ where: { userId }, select: { category: true, categoryId: true } });
    const lines = categories.map((category: any, index: number) => {
      const count = entries.filter((entry: any) => entry.categoryId === category.id || entry.category === category.name).length;
      return t(lang, `${index + 1}. ${category.name}：${count} 条`, `${index + 1}. ${category.name}: ${count}`);
    });
    return makeResult(name, "done", t(lang, `脑库分类（${categories.length} 个）：\n${lines.join("\n") || "暂无分类"}`, `Brain categories (${categories.length}):\n${lines.join("\n") || "No categories."}`), `${categories.length} categories`);
  }

  if (name === "search_document_semantic") {
    const query = String(args.query || "").trim();
    const topK = clamp(args.topK, 5, 10);
    const result = await deps.ragService.searchDocuments(userId, query, topK);
    const lines = result.results.map((item: any, index: number) => (
      t(lang, `${index + 1}. [doc:${item.documentId}] chunk ${item.chunkIndex} score ${item.score ?? 0}：${excerpt(item.content, 120)}`, `${index + 1}. [doc:${item.documentId}] chunk ${item.chunkIndex} score ${item.score ?? 0}: ${excerpt(item.content, 120)}`)
    ));
    return makeResult(
      name,
      "done",
      t(lang, `文档语义检索「${query}」${result.degraded ? "（已降级）" : ""}：\n${lines.join("\n") || "暂无匹配结果"}${result.error ? `\n错误：${result.error}` : ""}`, `Semantic document search for "${query}"${result.degraded ? " (degraded)" : ""}:\n${lines.join("\n") || "No matches."}${result.error ? `\nError: ${result.error}` : ""}`),
      `${result.results.length} semantic document matches`
    );
  }

  if (name === "search_knowledge_semantic") {
    const query = String(args.query || "").trim();
    const topK = clamp(args.topK, 5, 10);
    const result = await deps.ragService.searchKnowledge(userId, query, topK, () => deps.prisma.aIBrainKnowledge.findMany({ where: { userId } }));
    const lines = result.results.map((item: any, index: number) => (
      t(lang, `${index + 1}. [${item.category || "未分类"}] ${item.title} score ${item.score ?? 0}：${excerpt(item.description, 120)}`, `${index + 1}. [${item.category || "Uncategorized"}] ${item.title} score ${item.score ?? 0}: ${excerpt(item.description, 120)}`)
    ));
    return makeResult(
      name,
      "done",
      t(lang, `脑库语义检索「${query}」${result.degraded ? "（已降级）" : ""}：\n${lines.join("\n") || "暂无匹配结果"}${result.error ? `\n错误：${result.error}` : ""}`, `Semantic knowledge search for "${query}"${result.degraded ? " (degraded)" : ""}:\n${lines.join("\n") || "No matches."}${result.error ? `\nError: ${result.error}` : ""}`),
      `${result.results.length} semantic knowledge matches`
    );
  }

  if (name === "get_rag_status") {
    const status: { available: boolean; error?: string } = await deps.ragService.searchDocuments(userId, "__status__", 1)
      .then(() => ({ available: true }))
      .catch((error: any) => ({ available: false, error: error instanceof Error ? error.message : String(error) }));
    return makeResult(
      name,
      "done",
      t(lang, `语义检索状态：${status.available ? "可用" : "不可用"}${status.error ? `\n错误：${status.error}` : ""}`, `Semantic retrieval status: ${status.available ? "available" : "unavailable"}${status.error ? `\nError: ${status.error}` : ""}`),
      status.available ? "RAG available" : "RAG unavailable"
    );
  }

  return makeResult(name, "error", t(lang, "未实现的只读工具。", "Read-only tool is not implemented."), "not implemented");
}

function tool(name: string, args: Record<string, any> = {}): AssistantToolCall {
  return { id: "", name, arguments: JSON.stringify(args) };
}

// Interrogative / request markers. We only force a read-only tool when the
// user is clearly asking a question or requesting a listing — not when a
// keyword merely appears in unrelated prose (e.g. writing about spreadsheets).
const QUERY_INTENT_PATTERN = /有没有|有多少|多少|哪些|哪几|几篇|几个|几条|几张|什么|吗|呢|？|\?|查询|查一下|查查|查看|看看|看一下|列出|列一下|列表|显示|展示|搜索|检索|查找|找一下|找找|统计|help|list|find|search|show|howmany|what|which|\bany\b/;

function hasQueryIntent(text: string): boolean {
  return QUERY_INTENT_PATTERN.test(text);
}

export function resolvePrefetchReadonlyTools(
  content: string,
  options: { isSelectionEdit?: boolean } = {}
): AssistantToolCall[] {
  if (options.isSelectionEdit) return [];
  return inferReadonlyToolCalls(content);
}

export function inferReadonlyToolCalls(content: string): AssistantToolCall[] {
  const text = String(content || "").toLowerCase().replace(/\s+/g, "");
  const raw = String(content || "");
  if (!text) return [];
  // Require a clear question/listing intent before forcing any read-only tool.
  if (!hasQueryIntent(text)) return [];

  if (/今天|今日|today/.test(text) && /多少|几|一共|总共|合计|howmany|count/.test(text) && /文章|文档|篇|字|writing|written|wrote|article|document|doc/.test(text)) {
    return [tool("get_today_writing")];
  }
  if (/收藏|favorite|starred/.test(text) && /文档|文章|doc|article/.test(text)) return [tool("list_favorite_documents")];
  if (/表格|工作表|excel|spreadsheet|sheet/.test(text) && /有没有|搜索|查找|找|search|find/.test(text)) {
    const query = raw.match(/有没有(.+?)[？?。]?$/)?.[1]?.trim() || raw.replace(/.*?(搜索|查找|找)/, "").trim();
    return [tool("search_spreadsheets", { query: query || raw })];
  }
  if (/表格|工作表|excel|spreadsheet|sheet/.test(text)) return [tool("list_spreadsheets")];
  if (/回收站|废纸篓|trash|deleted/.test(text)) return [tool("list_trashed_documents")];
  if (/历史版本|版本记录|version/.test(text)) return [tool("list_document_versions")];
  if (/脑库|设定|角色|世界观|brain|knowledge|setting/.test(text) && /有没有|搜索|查找|找|search|find/.test(text)) {
    const query = raw.match(/有没有(.+?)[？?。]?$/)?.[1]?.trim() || raw.replace(/.*?(搜索|查找|找)/, "").trim();
    return [tool("search_brain_knowledge", { query: query || raw })];
  }
  if (/脑库|设定|brain|knowledge|setting/.test(text)) return [tool("list_brain_knowledge")];
  if (/分组|group/.test(text)) return [tool("list_document_groups")];
  if (/这周|本周|近7天|最近7天|weekly|week/.test(text) && /写|字|writing|words/.test(text)) return [tool("get_writing_range_stats", { days: 7 })];
  if (/最近|recent/.test(text) && /文档|文章|改|写|doc|article/.test(text)) return [tool("list_recent_documents")];
  return [];
}
