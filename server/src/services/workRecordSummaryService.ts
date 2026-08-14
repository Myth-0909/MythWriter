import prisma from "../lib/prisma";
import { t } from "../lib/i18n";
import { getUserApiKey } from "./aiService";
import { assertAiProviderHttpUrl } from "../lib/safeOutboundUrl";

export const WORK_RECORD_PERIODS = ["daily", "weekly", "monthly"] as const;
export type WorkRecordPeriod = typeof WORK_RECORD_PERIODS[number];

const AUTO_SUMMARY_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function isWorkRecordPeriod(value: unknown): value is WorkRecordPeriod {
  return typeof value === "string" && WORK_RECORD_PERIODS.includes(value as WorkRecordPeriod);
}

export function parseDateOnly(value?: unknown): Date {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfWeekUTC(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + diff);
  return result;
}

export function normalizeTargetDate(period: WorkRecordPeriod, value?: unknown): Date {
  const date = parseDateOnly(value);
  if (period === "weekly") return startOfWeekUTC(date);
  if (period === "monthly") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return date;
}

export function periodEnd(period: WorkRecordPeriod, start: Date): Date {
  const end = new Date(start);
  if (period === "monthly") {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCDate(end.getUTCDate() + (period === "weekly" ? 7 : 1));
  }
  return end;
}

function formatZhMonthDay(date: Date) {
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function formatEnMonthDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatEnMonth(date: Date) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

export function summaryTitle(period: "weekly" | "monthly", targetDate: Date, lang: string) {
  if (period === "monthly") {
    return t(
      lang,
      `${targetDate.getUTCFullYear()}年${targetDate.getUTCMonth() + 1}月总结`,
      `${formatEnMonth(targetDate)} Summary`
    );
  }

  const endDate = new Date(targetDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return t(
    lang,
    `${formatZhMonthDay(targetDate)}-${formatZhMonthDay(endDate)}一周总结`,
    `${formatEnMonthDay(targetDate)}-${formatEnMonthDay(endDate)} Weekly Summary`
  );
}

export function defaultTitle(period: WorkRecordPeriod, date: Date, lang: string) {
  const dateText = date.toISOString().slice(0, 10);
  if (period === "weekly" || period === "monthly") return summaryTitle(period, date, lang);
  return t(lang, `每日记录 ${dateText}`, `Daily record ${dateText}`);
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function extractJsonObject(value: string): any | null {
  const trimmed = value.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fence?.[1]?.trim() || trimmed;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  try {
    return JSON.parse(objectMatch[0]);
  } catch {
    return null;
  }
}

async function requestAiText(params: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  maxTokens?: number;
}) {
  assertAiProviderHttpUrl(params.apiBaseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  timeout.unref?.();
  let response: Response;
  try {
    response = await fetch(buildChatCompletionsUrl(params.apiBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: 0.25,
        max_tokens: params.maxTokens ?? 1800,
        stream: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI service error (${response.status}): ${text.slice(0, 160)}`);
  }

  const json = await response.json() as any;
  return String(json.choices?.[0]?.message?.content || json.choices?.[0]?.text || "").trim();
}

function normalizeNumberedList(value: string) {
  const prepared = value
    .replace(/\r/g, "")
    .replace(/\s+(?=\d+[.、)]\s)/g, "\n")
    .replace(/^#+\s*.*总结\s*$/gim, "");
  const lines = prepared
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^(?:[-*•]|\d+[.、)]|\(\d+\))\s*/, "").trim())
    .filter(Boolean);

  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

function normalizeAiSummary(raw: string) {
  const parsed = extractJsonObject(raw);
  const content = String(parsed?.content || raw).trim();
  return normalizeNumberedList(content);
}

export async function generatePeriodSummary(params: {
  userId: string;
  period: "weekly" | "monthly";
  targetDate: Date;
  overwrite: boolean;
}) {
  const { userId, period, targetDate, overwrite } = params;
  if (!overwrite) {
    const existing = await prisma.workRecord.findUnique({
      where: {
        userId_period_targetDate: {
          userId,
          period,
          targetDate,
        },
      },
    });
    if (existing) return { record: existing, sourceCount: 0, skipped: true };
  }

  const endDate = periodEnd(period, targetDate);
  const sourcePeriods = period === "weekly" ? ["daily"] : ["daily", "weekly"];
  const sourceRecords = await prisma.workRecord.findMany({
    where: {
      userId,
      period: { in: sourcePeriods },
      targetDate: { gte: targetDate, lt: endDate },
      content: { not: "" },
    },
    orderBy: [{ period: "asc" }, { targetDate: "asc" }],
  });

  if (sourceRecords.length === 0) return { record: null, sourceCount: 0, skipped: true };

  const { apiKey, apiBaseUrl, aiModel, lang: userLang } = await getUserApiKey(userId);
  if (!apiKey) throw new Error(t(userLang, "请先在大模型配置中配置 API Key", "Please configure an API key in model settings"));

  const fixedTitle = summaryTitle(period, targetDate, userLang);
  const scopeLabel = period === "weekly"
    ? t(userLang, "上一周内容", "last week's entries")
    : t(userLang, "上个月内容", "last month's entries");
  const sourceText = sourceRecords.map((record: any) => [
    `【${record.period} ${record.targetDate.toISOString().slice(0, 10)}】${record.title}`,
    record.content,
  ].join("\n")).join("\n\n---\n\n");

  const raw = await requestAiText({
    apiBaseUrl,
    apiKey,
    model: aiModel,
    maxTokens: period === "weekly" ? 1600 : 2400,
    messages: [
      { role: "system", content: "你是 ZNWriter 的随记总结助手。只返回 JSON，不要 markdown 代码块。" },
      {
        role: "user",
        content: [
          `请根据以下${scopeLabel}生成总结。`,
          `标题必须是：${fixedTitle}`,
          "内容必须是列表形式，使用纯 Markdown 编号列表，每项一行：1. xxxx 2. xxxx 3. xxxx。",
          "只保留关键进展、状态变化、问题风险和下一步，不要写开场白、结尾、二级标题或表格。",
          "返回 JSON：{\"title\":\"固定标题\",\"content\":\"1. xxxx\\n2. xxxx\\n3. xxxx\"}",
          "来源记录：",
          sourceText.slice(0, 18000),
        ].join("\n"),
      },
    ],
  });

  const content = normalizeAiSummary(raw);
  const record = await prisma.workRecord.upsert({
    where: {
      userId_period_targetDate: {
        userId,
        period,
        targetDate,
      },
    },
    update: overwrite
      ? {
          title: fixedTitle,
          content,
          aiSummary: content,
        }
      : {},
    create: {
      userId,
      period,
      targetDate,
      title: fixedTitle,
      content,
      aiSummary: content,
    },
  });

  return { record, sourceCount: sourceRecords.length, skipped: false };
}

function getZonedToday(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(pick("year"), pick("month") - 1, pick("day")));
}

async function generateAutomaticSummaries() {
  const users = await prisma.user.findMany({ select: { id: true, timeZone: true } });
  for (const user of users) {
    let today: Date;
    try {
      today = getZonedToday(user.timeZone || "UTC");
    } catch {
      today = getZonedToday("UTC");
    }
    const jobs: { period: "weekly" | "monthly"; targetDate: Date }[] = [];
    if (today.getUTCDay() === 1) {
      const previousWeek = new Date(today);
      previousWeek.setUTCDate(previousWeek.getUTCDate() - 7);
      jobs.push({ period: "weekly", targetDate: previousWeek });
    }
    if (today.getUTCDate() === 1) {
      jobs.push({
        period: "monthly",
        targetDate: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)),
      });
    }
    for (const job of jobs) {
      try {
        const result = await generatePeriodSummary({
          userId: user.id,
          period: job.period,
          targetDate: job.targetDate,
          overwrite: false,
        });
        if (!result.skipped) {
          console.log(`[WorkRecord] Auto ${job.period} summary generated for user ${user.id}`);
        }
      } catch (error) {
        console.error(`[WorkRecord] Auto ${job.period} summary failed for user ${user.id}:`, error);
      }
    }
  }
}

let schedulerStarted = false;

export function startWorkRecordSummaryScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const initial = setTimeout(() => void generateAutomaticSummaries(), 30_000);
  const interval = setInterval(() => void generateAutomaticSummaries(), AUTO_SUMMARY_CHECK_INTERVAL_MS);
  initial.unref?.();
  interval.unref?.();
}
