import { Router, Request, Response } from "express";
import { AuthRequest, authMiddleware, authMiddlewareWithBlacklist } from "../middleware/auth";
import { aiChatLimiter } from "../middleware/rateLimiter";
import { t } from "../lib/i18n";
import prisma from "../lib/prisma";
import {
  buildSystemPrompt, detectDeleteCommand, detectInjection,
  parseAction, safePersonality, getUserApiKey,
  listConversations, saveConversation, deleteConversations,
  logActivity, saveFeedback, getSemanticContext,
} from "../services/aiService";
import type { Personality } from "../services/aiService";
import { selectReferencedBrainIds, type ChatReference } from "../services/aiReferences";
import { formatBrainKnowledgeContext, RAG_SCORE_THRESHOLD, ragService } from "../services/ragService";
import { createAgentWriteService } from "../services/agentService";
import { createDocument } from "../services/documentService";

const router = Router();
const MAX_REFERENCE_DOCS = 4;
const MAX_REFERENCE_CHARS = 6000;
const MAX_TOTAL_REFERENCE_CHARS = 16000;

type ReferenceDocument = {
  id: string;
  title: string;
  content: string;
  updatedAt: Date;
};

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function getRequestLang(req: Request): "zh" | "en" {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

function normalizeWritingReview(raw: any, fallbackTitle = "Suggestion") {
  const suggestions = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
  return {
    score: Math.max(0, Math.min(100, Number(raw?.score) || 72)),
    suggestions: suggestions.slice(0, 5).map((item: any, index: number) => ({
      id: String(item?.id || `suggestion-${index + 1}`),
      type: String(item?.type || "readability"),
      title: String(item?.title || fallbackTitle).slice(0, 80),
      detail: String(item?.detail || "").slice(0, 500),
      actionPrompt: String(item?.actionPrompt || item?.detail || "").slice(0, 500),
      severity: ["high", "medium", "low"].includes(item?.severity) ? item.severity : "medium",
    })).filter((item: any) => item.detail || item.actionPrompt),
  };
}

function normalizeAgentTargetWords(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(String(value || "").replace(/\D/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 1200;
  return Math.max(300, Math.min(8000, Math.round(numeric)));
}

function maxTokensForTargetWords(targetWords: number): number {
  return Math.max(900, Math.min(3600, Math.ceil(targetWords * 0.95)));
}

async function requestChatCompletionText(params: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), 180000);
  if (params.signal?.aborted) controller.abort();
  params.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(buildChatCompletionsUrl(params.apiBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.4,
        max_tokens: params.maxTokens ?? 1800,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI service error (${response.status}): ${errText.slice(0, 160)}`);
    }

    const json = await response.json() as any;
      return String(json.choices?.[0]?.message?.content || json.choices?.[0]?.text || "").trim();
  } finally {
    params.signal?.removeEventListener("abort", abortFromCaller);
    clearTimeout(timeout);
  }
}

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function buildReferenceContext(userId: string, references: ChatReference[] | undefined): Promise<string> {
  if (!Array.isArray(references) || references.length === 0) return "";
  const ids = Array.from(new Set(
    references
      .filter((ref) => ref?.type === "document" && typeof ref.id === "string")
      .map((ref) => ref.id as string)
  )).slice(0, MAX_REFERENCE_DOCS);
  if (ids.length === 0) return "";

  const docs: ReferenceDocument[] = await prisma.document.findMany({
    where: { id: { in: ids }, userId, isDeleted: false },
    select: { id: true, title: true, content: true, updatedAt: true },
  });
  if (docs.length === 0) return "";

  const orderedDocs = ids
    .map((id) => docs.find((doc) => doc.id === id))
    .filter((doc): doc is ReferenceDocument => Boolean(doc));

  let remainingChars = MAX_TOTAL_REFERENCE_CHARS;
  return orderedDocs.map((doc) => {
    const availableChars = Math.max(0, Math.min(MAX_REFERENCE_CHARS, remainingChars));
    const rawContent = stripHtml(doc.content);
    const content = rawContent.slice(0, availableChars);
    remainingChars -= content.length;
    const truncatedNote = rawContent.length > content.length ? "\n（内容已按上下文窗口自动截断）" : "";
    return [
      `[引用文档：${doc.title}] [doc:${doc.id}]`,
      `更新时间：${doc.updatedAt.toISOString()}`,
      "内容：",
      `${content || "(空文档)"}${truncatedNote}`,
    ].join("\n");
  }).join("\n\n---\n\n");
}

async function buildBrainKnowledgeContext(userId: string, text: string, references?: ChatReference[]): Promise<string> {
  try {
    const referencedIds = selectReferencedBrainIds(references);

    if (referencedIds.length > 0) {
      const knowledges = await prisma.aIBrainKnowledge.findMany({
        where: { userId, id: { in: referencedIds } },
        select: { id: true, title: true, description: true, category: true },
      });
      const ordered = referencedIds
        .map((id) => knowledges.find((knowledge: any) => knowledge.id === id))
        .filter(Boolean);
      return formatBrainKnowledgeContext(ordered);
    }

    if (!text.trim()) return "";

    const result = await ragService.searchKnowledge(
      userId,
      text,
      5,
      () => prisma.aIBrainKnowledge.findMany({
        where: { userId },
        select: { id: true, title: true, description: true, category: true },
      })
    );
    const matches = result.degraded
      ? result.results
      : result.results.filter((knowledge) => (knowledge.score || 0) > RAG_SCORE_THRESHOLD);
    return formatBrainKnowledgeContext(matches);
  } catch (err) {
    console.error("Build brain knowledge context error:", err);
    return "";
  }
}

// All AI routes require auth (with blacklist check) + rate limit
router.use(authMiddlewareWithBlacklist);
router.use(aiChatLimiter);

// Greeting
router.post("/greeting", async (req: Request, res: Response) => {
  try {
    const { userName, personality } = req.body;
    const name = userName || "用户";
    const pers = safePersonality(personality);

    const greetings: Record<Personality, string> = {
      normal: `${name} 您好！我是小安，很高兴见到您！今天想写点什么？我随时准备帮您~`,
      cute: `${name} 您好呀~ 我是小安呢 💕 嘿嘿，有什么需要我帮忙的嘛？一起开心地写作吧！🌸✨`,
      catgirl: `${name} 您好喵~！我是小安喵~ 今天想写点什么呢？我会努力帮您的喵！`,
      serious: `${name}，您好。我是小安，专注于协助您完成各类写作任务。请说明您的需求。`,
      silly: `哇哦！${name} 来了！我是小安——您的写作小伙伴！今天咱们是要写点什么惊天动地的大作呢，还是来点轻松愉快的小品？`,
    };

    res.json({ greeting: greetings[pers] });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// AI writing review for the current document
router.post("/writing-review", async (req: Request, res: Response) => {
  try {
    const { title, content } = req.body;
    const plainText = stripHtml(String(content || "")).slice(0, 12000);
    const authReq = req as AuthRequest;
    const { apiKey, apiBaseUrl, aiModel, lang: userLang } = await getUserApiKey(authReq.user!.userId);
    if (!apiKey) {
      res.status(400).json({ error: t(userLang, "请先在设置中配置 API Key", "Please configure API Key in Settings") });
      return;
    }
    if (plainText.length < 40) {
      res.status(400).json({ error: t(userLang, "当前文档内容太少，暂时无法分析。", "The current document is too short to analyze.") });
      return;
    }

    const prompt = [
      "你是 ZNWriter 的写作检查器。请只返回 JSON，不要 markdown。",
      "分析当前文档，给出 0-100 综合评分和最多 5 条可执行建议。",
      "建议类型只能是 structure/tone/readability/completeness/density。",
      "JSON 格式：{\"score\":82,\"suggestions\":[{\"id\":\"s1\",\"type\":\"structure\",\"severity\":\"medium\",\"title\":\"标题\",\"detail\":\"问题说明\",\"actionPrompt\":\"给 AI 执行的修改指令\"}]}",
      `文档标题：${String(title || "无标题文档")}`,
      "文档内容：",
      plainText,
    ].join("\n");

    const response = await fetch(buildChatCompletionsUrl(apiBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: "Return valid compact JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: t(userLang, `AI 写作检查失败: ${errText.slice(0, 120)}`, `AI writing review failed: ${errText.slice(0, 120)}`) });
      return;
    }

    const json = await response.json() as any;
    const rawContent = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || "";
    const parsed = extractJsonObject(rawContent);
    const normalized = normalizeWritingReview(parsed, t(userLang, "写作建议", "Writing suggestion"));
    if (normalized.suggestions.length === 0) {
      normalized.suggestions = [{
        id: "readability-1",
        type: "readability",
        title: t(userLang, "优化表达节奏", "Improve pacing"),
        detail: t(userLang, "建议检查段落长度、重复表达和句式节奏，让文章更容易阅读。", "Review paragraph length, repeated wording, and sentence rhythm to make the article easier to read."),
        actionPrompt: t(userLang, "优化文章表达节奏，减少重复表达，并保持原意。", "Improve pacing, reduce repetition, and preserve the original meaning."),
        severity: "medium",
      }];
    }
    res.json(normalized);
  } catch (error) {
    console.error("Writing review error:", error);
    const userLang = getRequestLang(req);
    res.status(500).json({ error: t(userLang, "AI 写作检查失败", "AI writing review failed") });
  }
});

// Agent writing flow with progress SSE
router.post("/agent/write", async (req: Request, res: Response) => {
  let streamStarted = false;
  const requestController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) requestController.abort();
  });

  const safeWrite = (event: string, data: unknown) => {
    if (!res.writableEnded && !res.destroyed) writeSse(res, event, data);
  };

  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.userId;
    const userLangFromRequest = getRequestLang(req);
    const { goal, style, length, stylePrompt, targetWords, includeBrain, includeDocuments } = req.body || {};
    const trimmedGoal = typeof goal === "string" ? goal.trim() : "";
    const normalizedTargetWords = normalizeAgentTargetWords(targetWords);
    const normalizedStylePrompt = typeof stylePrompt === "string" ? stylePrompt.trim().slice(0, 120) : "";

    if (!trimmedGoal) {
      res.status(400).json({ error: t(userLangFromRequest, "写作目标不能为空", "Writing goal is required") });
      return;
    }

    if (detectInjection(trimmedGoal)) {
      res.status(400).json({ error: t(userLangFromRequest, "检测到不安全输入，已拒绝该请求。", "Unsafe input detected. Request rejected.") });
      return;
    }

    const { apiKey, apiBaseUrl, aiModel, lang: userLang } = await getUserApiKey(userId);
    if (!apiKey) {
      res.status(400).json({ error: t(userLang, "请先在设置中配置 API Key", "Please configure API Key in Settings") });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    streamStarted = true;
    res.write(":ok\n\n");

    const service = createAgentWriteService({
      async completeJson(step, prompt) {
        const content = await requestChatCompletionText({
          apiBaseUrl,
          apiKey,
          model: aiModel,
          messages: [
            {
              role: "system",
              content: "Return valid compact JSON only. Do not use markdown fences.",
            },
            { role: "user", content: prompt },
          ],
          temperature: step === "review" ? 0.2 : 0.35,
          maxTokens: step === "plan" ? 1800 : 1000,
          signal: requestController.signal,
        });
        const parsed = extractJsonObject(content);
        if (!parsed) {
          throw new Error(t(userLang, "AI 未返回可解析的 JSON", "AI returned JSON that could not be parsed"));
        }
        return parsed;
      },
      async completeText(_step, prompt) {
        return requestChatCompletionText({
          apiBaseUrl,
          apiKey,
          model: aiModel,
          messages: [
            {
              role: "system",
              content: "你是小安，专注于按大纲生成可直接进入文档的正文。不要输出解释、JSON 或元信息。",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.65,
          maxTokens: maxTokensForTargetWords(normalizedTargetWords),
          signal: requestController.signal,
        });
      },
      searchKnowledge(userIdArg, query, topK) {
        return ragService.searchKnowledge(
          userIdArg,
          query,
          topK,
          () => prisma.aIBrainKnowledge.findMany({
            where: { userId: userIdArg },
            select: { id: true, title: true, description: true, category: true },
          })
        );
      },
      searchDocuments(userIdArg, query, topK) {
        return ragService.searchDocuments(userIdArg, query, topK);
      },
      async createDocument(data) {
        const doc = await createDocument(userId, {
          title: data.title,
          content: data.content,
          category: data.category,
        });
        ragService.reindexDocument({ userId, id: doc.id, content: doc.content }).catch((error) => {
          console.warn("[agent_write] document reindex failed:", error);
        });
        return { id: doc.id, title: doc.title };
      },
    });

    const result = await service.write(
      {
        userId,
        goal: trimmedGoal,
        style,
        length,
        stylePrompt: normalizedStylePrompt,
        targetWords: normalizedTargetWords,
        includeBrain: includeBrain !== false,
        includeDocuments: includeDocuments !== false,
        lang: userLang === "en" ? "en" : "zh",
      },
      (event) => safeWrite("progress", event)
    );

    safeWrite("done", {
      docId: result.docId,
      title: result.title,
      outline: result.outline,
      review: result.review,
      sources: result.sources,
    });
    if (!res.writableEnded && !res.destroyed) res.end();
  } catch (error: any) {
    console.error("[agent_write] error:", error);
    const payload = { error: error?.message || "Agent write failed" };
    if (streamStarted) {
      safeWrite("error", payload);
      if (!res.writableEnded && !res.destroyed) res.end();
      return;
    }
    const userLang = getRequestLang(req);
    res.status(500).json({
      error: t(userLang, `AI 写作失败: ${payload.error}`, `AI writing failed: ${payload.error}`),
    });
  }
});

// Streaming chat
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { messages, personality, memoryContext, purpose, references } = req.body;
    const isSelectionEdit = purpose === "selection_edit";

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    if (lastUserMsg) {
      const content = (lastUserMsg.content || "").toLowerCase();

      if (detectInjection(lastUserMsg.content)) {
        res.json({
          reply: "检测到不安全输入，已拒绝该请求。请正常使用小安写作功能。",
          action: null,
        });
        return;
      }

      if (!isSelectionEdit && detectDeleteCommand(content)) {
        res.json({
          reply: "为了安全起见，我无法执行删除操作。请使用应用内的删除功能手动操作。",
          action: null,
        });
        return;
      }
    }

    const authReq = req as AuthRequest;
    const { apiKey, apiBaseUrl, aiModel, lang: userLang } = await getUserApiKey(authReq.user!.userId);
    if (!apiKey) {
      res.status(400).json({ error: t(userLang, "请先在设置中配置 API Key", "Please configure API Key in Settings") });
      return;
    }

    const pers = safePersonality(personality);
    const referenceContext = await buildReferenceContext(authReq.user!.userId, references);

    const userText = lastUserMsg ? lastUserMsg.content : "";
    const brainKnowledgeContext = await buildBrainKnowledgeContext(authReq.user!.userId, userText, references);

    // For selection edit: extract semantic context from the referenced document
    let selectionContext = "";
    if (isSelectionEdit && references) {
      const docRef = references.find((r: any) => r?.type === "document" && r?.id && r?.selectedText);
      if (docRef) {
        const doc = await prisma.document.findFirst({
          where: { id: docRef.id, userId: authReq.user!.userId, isDeleted: false },
          select: { content: true },
        });
        if (doc) {
          const plainText = stripHtml(doc.content);
          const { preceding, succeeding } = getSemanticContext(plainText, docRef.selectedText);
          if (preceding || succeeding) {
            selectionContext = `【选中文字的上下文（用于理解语境，请勿修改或重复这些内容）】\n前文：${preceding || "(无)"}\n后文：${succeeding || "(无)"}`;
          }
        }
      }
    }

    const systemPrompt = buildSystemPrompt(
      pers,
      [
        memoryContext || "",
        referenceContext
          ? `用户为本次对话引用了以下项目文档作为上下文。回答时优先依据这些文档；如果文档信息不足，请明确说明。普通回答中如使用了文档信息，请简短标注来源文档标题；执行 update_document 时必须使用对应 [doc:xxxxx]。\n\n${referenceContext}`
          : "",
        brainKnowledgeContext || "",
        selectionContext,
      ].filter(Boolean).join("\n\n")
    );

    // For selection edit, enforce outputting only the processed text
    const finalSystemPrompt = isSelectionEdit
      ? `${systemPrompt}\n\nCRITICAL: You are editing selected text. Return ONLY the processed result. Do NOT include any explanation, greeting, thinking tags (<think>, <thinking>), or meta-commentary. The entire output will directly replace the user's selected text.`
      : systemPrompt;

    const apiUrl = buildChatCompletionsUrl(apiBaseUrl);
    console.log("[AI] Sending request to:", apiUrl, "model:", aiModel);

    // Use streaming with 3min timeout (vLLM cold start can be slow)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: "system", content: finalSystemPrompt },
            ...messages,
          ],
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      console.error("[AI] Fetch failed:", fetchErr.message);
      if (fetchErr.name === "AbortError") {
        res.status(504).json({ error: `AI 服务连接超时 (${apiUrl})` });
      } else {
        res.status(502).json({ error: `无法连接 AI 服务: ${fetchErr.message}` });
      }
      return;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[AI] Upstream error:", response.status, errText.slice(0, 500));
      res.status(502).json({ error: `AI 服务返回错误 (${response.status}): ${errText.slice(0, 200)}` });
      return;
    }

    // Check if upstream returned JSON (non-streaming) instead of SSE.
    // Some OpenAI-compatible services send streaming chunks as text/plain, so
    // only application/json should take the eager JSON path.
    const upstreamContentType = response.headers.get("content-type") || "";
    const isJson = upstreamContentType.includes("application/json");
    if (isJson) {
      try {
        const json = await response.json() as any;
        const content = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || "";
        const { reply, action } = parseAction(content);
        console.log("[AI] Got non-streaming JSON response, content length:", content.length);
        res.json({ reply: reply || content, action });
      } catch (err) {
        console.error("[AI] JSON parse error:", err);
        res.status(502).json({ error: "AI 服务返回了无法解析的响应" });
      }
      return;
    }

    // Set up SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    // Send initial comment to establish SSE connection
    res.write(":ok\n\n");

    const reader = response.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: "No response body" })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let rawTextContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!trimmed.startsWith("data: ")) {
            rawTextContent += `${trimmed}\n`;
            continue;
          }

          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.message?.content ??
              parsed.choices?.[0]?.text;
            if (content) {
              fullContent += content;
              // Buffer all content first; will stream clean reply after parsing
            }
          } catch {
            rawTextContent += `${data}\n`;
          }
        }
      }
    } catch (err) {
      console.error("[AI] Stream read error:", err);
    }

    // Fallback: if no content captured via SSE, try parsing buffer as JSON
    let finalContent = fullContent;
    const rawFallback = `${rawTextContent}${buffer}`.trim();
    if (!fullContent && rawFallback) {
      try {
        const json = JSON.parse(rawFallback);
        finalContent = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || "";
        console.log("[AI] Fallback JSON parse success, content length:", finalContent.length);
      } catch {
        finalContent = rawFallback;
        console.log("[AI] Fallback raw text response, content length:", finalContent.length);
      }
    }

    // Parse the full buffered response
    const { reply, action } = parseAction(finalContent);
    const cleanReply = reply || finalContent || "";
    console.log("[AI] parseAction result - reply:", cleanReply.slice(0, 100));
    console.log("[AI] parseAction result - action:", JSON.stringify(action));

    // Stream the clean reply as deltas (typewriter effect), 2 chars per chunk
    for (let i = 0; i < cleanReply.length; i += 2) {
      const chunk = cleanReply.slice(i, i + 2);
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      // Small delay for natural typewriter feel
      await new Promise((r) => setTimeout(r, 10));
    }

    // Send final message with parsed action
    res.write(`data: ${JSON.stringify({ done: true, reply: cleanReply, action })}\n\n`);
    res.end();
  } catch (error) {
    console.error("[AI] Route error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: `服务器内部错误: ${(error as Error).message || "未知错误"}` });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
});

// --- Conversation CRUD ---

router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const conversations = await listConversations(authReq.user!.userId);
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/conversations", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { messages, personality } = req.body;
    if (!messages) {
      res.status(400).json({ error: "messages is required" });
      return;
    }
    const conversation = await saveConversation(authReq.user!.userId, messages, personality);
    res.json({ conversation });
  } catch (error) {
    console.error("Save conversation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/conversations", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    await deleteConversations(authReq.user!.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Activity Log ---
router.post("/log", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { action, detail } = req.body;
    if (!action) {
      res.status(400).json({ error: "action is required" });
      return;
    }
    await logActivity(authReq.user!.userId, action, detail);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Feedback ---
router.post("/feedback", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { messageContent, feedbackType, rating, reason } = req.body;
    if (!messageContent || !feedbackType) {
      res.status(400).json({ error: "messageContent and feedbackType are required" });
      return;
    }
    const feedback = await saveFeedback(authReq.user!.userId, req.body);
    res.json({ feedback });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
