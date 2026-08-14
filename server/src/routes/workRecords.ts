import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";
import { getUserApiKey } from "../services/aiService";
import { assertAiProviderHttpUrl } from "../lib/safeOutboundUrl";
import { countDocumentWords } from "../lib/documentWordCount";
import { netWordDelta } from "../services/writingStats";
import { recordWritingDelta } from "../services/writingActivityService";
import { invalidateTodayWritingCache } from "../services/chatUserContext";
import {
  defaultTitle,
  generatePeriodSummary,
  isWorkRecordPeriod,
  normalizeTargetDate,
  type WorkRecordPeriod,
} from "../services/workRecordSummaryService";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
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
  const response = await fetch(buildChatCompletionsUrl(params.apiBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: 0.35,
      max_tokens: params.maxTokens ?? 1800,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI service error (${response.status}): ${text.slice(0, 160)}`);
  }

  const json = await response.json() as any;
  return String(json.choices?.[0]?.message?.content || json.choices?.[0]?.text || "").trim();
}

function normalizeAiRecord(raw: string, fallbackTitle: string) {
  const parsed = extractJsonObject(raw);
  const title = String(parsed?.title || fallbackTitle).trim().slice(0, 120);
  const content = String(parsed?.content || raw).trim();
  return { title, content };
}

router.use(authMiddleware);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const period = isWorkRecordPeriod(req.query.period) ? req.query.period : undefined;
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const records = await prisma.workRecord.findMany({
      where: {
        userId: req.user!.userId,
        ...(period ? { period } : {}),
      },
      orderBy: { targetDate: "desc" },
      take: limit,
    });
    res.json({ records });
  } catch (error) {
    console.error("List work records error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取记录失败", "Failed to load records") });
  }
});

router.get("/current", async (req: AuthRequest, res: Response) => {
  try {
    if (!isWorkRecordPeriod(req.query.period)) {
      res.status(400).json({ error: t(requestLang(req), "记录类型无效", "Invalid record period") });
      return;
    }
    const targetDate = normalizeTargetDate(req.query.period, req.query.targetDate);
    const record = await prisma.workRecord.findUnique({
      where: {
        userId_period_targetDate: {
          userId: req.user!.userId,
          period: req.query.period,
          targetDate,
        },
      },
    });
    res.json({ record });
  } catch (error) {
    console.error("Get current work record error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取记录失败", "Failed to load record") });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const lang = requestLang(req);
    const { period, targetDate: rawTargetDate, title, content } = req.body || {};
    if (!isWorkRecordPeriod(period)) {
      res.status(400).json({ error: t(lang, "记录类型无效", "Invalid record period") });
      return;
    }

    const targetDate = normalizeTargetDate(period, rawTargetDate);
    const nextTitle = String(title || defaultTitle(period, targetDate, lang)).trim().slice(0, 120);
    const nextContent = String(content || "").trim();

    const existing = await prisma.workRecord.findUnique({
      where: {
        userId_period_targetDate: {
          userId: req.user!.userId,
          period,
          targetDate,
        },
      },
      select: { content: true },
    });

    const record = await prisma.workRecord.upsert({
      where: {
        userId_period_targetDate: {
          userId: req.user!.userId,
          period,
          targetDate,
        },
      },
      update: {
        title: nextTitle,
        content: nextContent,
      },
      create: {
        userId: req.user!.userId,
        period,
        targetDate,
        title: nextTitle,
        content: nextContent,
      },
    });

    if (period === "daily") {
      const growth = netWordDelta(
        countDocumentWords(existing?.content),
        countDocumentWords(nextContent)
      );
      if (growth !== 0) {
        await recordWritingDelta(req.user!.userId, { journalWords: growth });
        invalidateTodayWritingCache(req.user!.userId);
      }
    }

    res.json({ record });
  } catch (error) {
    console.error("Save work record error:", error);
    res.status(500).json({ error: t(requestLang(req), "保存记录失败", "Failed to save record") });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.workRecord.deleteMany({
      where: {
        id: String(req.params.id),
        userId: req.user!.userId,
      },
    });
    res.json({ success: result.count > 0 });
  } catch (error) {
    console.error("Delete work record error:", error);
    res.status(500).json({ error: t(requestLang(req), "删除记录失败", "Failed to delete record") });
  }
});

router.post("/ai/generate", async (req: AuthRequest, res: Response) => {
  try {
    const lang = requestLang(req);
    const { period, targetDate: rawTargetDate } = req.body || {};
    if (!isWorkRecordPeriod(period) || period === "daily") {
      res.status(400).json({ error: t(lang, "请选择每周或每月记录进行生成", "Please choose weekly or monthly record generation") });
      return;
    }

    const result = await generatePeriodSummary({
      userId: req.user!.userId,
      period,
      targetDate: normalizeTargetDate(period, rawTargetDate),
      overwrite: true,
    });

    if (!result.record || result.sourceCount === 0) {
      res.status(400).json({ error: t(lang, "没有可用于生成的来源记录", "No source records available for generation") });
      return;
    }
    res.json({ record: result.record, sourceCount: result.sourceCount });
  } catch (error) {
    console.error("Generate work record error:", error);
    res.status(500).json({ error: t(requestLang(req), "AI 生成记录失败", "Failed to generate record with AI") });
  }
});

router.post("/ai/polish", async (req: AuthRequest, res: Response) => {
  try {
    const lang = requestLang(req);
    const { period, title, content } = req.body || {};
    if (!isWorkRecordPeriod(period)) {
      res.status(400).json({ error: t(lang, "记录类型无效", "Invalid record period") });
      return;
    }
    const rawContent = String(content || "").trim();
    if (!rawContent) {
      res.status(400).json({ error: t(lang, "请先填写记录内容", "Please write record content first") });
      return;
    }

    const { apiKey, apiBaseUrl, aiModel, lang: userLang } = await getUserApiKey(req.user!.userId);
    if (!apiKey) {
      res.status(400).json({ error: t(userLang, "请先在大模型配置中配置 API Key", "Please configure an API key in model settings") });
      return;
    }

    const raw = await requestAiText({
      apiBaseUrl,
      apiKey,
      model: aiModel,
      maxTokens: 1800,
      messages: [
        { role: "system", content: "你是 ZNWriter 的记录润色助手。只返回 JSON，不要 markdown 代码块。" },
        {
          role: "user",
          content: [
            "请优化下面的工作记录。",
            "要求：保留事实，不虚构；语言更清晰；适当分层；Markdown 格式；语气温和专业。",
            "返回 JSON：{\"title\":\"标题\",\"content\":\"Markdown 内容\"}",
            `记录类型：${period}`,
            `标题：${String(title || "")}`,
            "内容：",
            rawContent.slice(0, 12000),
          ].join("\n"),
        },
      ],
    });

    res.json(normalizeAiRecord(raw, String(title || defaultTitle(period, new Date(), userLang))));
  } catch (error) {
    console.error("Polish work record error:", error);
    res.status(500).json({ error: t(requestLang(req), "AI 优化记录失败", "Failed to polish record with AI") });
  }
});

export default router;
