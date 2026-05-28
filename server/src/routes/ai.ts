import { Router, Request, Response } from "express";
import { AuthRequest, authMiddleware, authMiddlewareWithBlacklist } from "../middleware/auth";
import { aiChatLimiter } from "../middleware/rateLimiter";
import { t } from "../lib/i18n";
import prisma from "../lib/prisma";
import {
  buildSystemPrompt, detectDeleteCommand, detectInjection,
  parseAction, safePersonality, getUserApiKey,
  listConversations, saveConversation, deleteConversations,
  logActivity, saveFeedback,
} from "../services/aiService";
import type { Personality } from "../services/aiService";

const router = Router();
const MAX_REFERENCE_DOCS = 4;
const MAX_REFERENCE_CHARS = 12000;

type ChatReference = {
  type?: string;
  id?: string;
  title?: string;
};

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

  return orderedDocs.map((doc) => {
    const content = stripHtml(doc.content).slice(0, MAX_REFERENCE_CHARS);
    return [
      `[引用文档：${doc.title}]`,
      `更新时间：${doc.updatedAt.toISOString()}`,
      "内容：",
      content || "(空文档)",
    ].join("\n");
  }).join("\n\n---\n\n");
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
      normal: `${name} 您好！我是小麦，很高兴见到您！今天想写点什么？我随时准备帮您~`,
      cute: `${name} 您好呀~ 我是小麦呢 💕 嘿嘿，有什么需要我帮忙的嘛？一起开心地写作吧！🌸✨`,
      catgirl: `${name} 您好喵~！我是小麦喵~ 今天想写点什么呢？我会努力帮您的喵！`,
      serious: `${name}，您好。我是小麦，专注于协助您完成各类写作任务。请说明您的需求。`,
      silly: `哇哦！${name} 来了！我是小麦——您的写作小伙伴！今天咱们是要写点什么惊天动地的大作呢，还是来点轻松愉快的小品？`,
    };

    res.json({ greeting: greetings[pers] });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
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
          reply: "检测到不安全输入，已拒绝该请求。请正常使用写作助手功能。",
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
    const systemPrompt = buildSystemPrompt(
      pers,
      [
        memoryContext || "",
        referenceContext
          ? `用户为本次对话引用了以下项目文档作为上下文。回答时优先依据这些文档；如果文档信息不足，请明确说明。\n\n${referenceContext}`
          : "",
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
          max_tokens: 2048,
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
              // Send the delta to client
              res.write(`data: ${JSON.stringify({ delta: content })}\n\n`);
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

    // Parse final response for actions
    const { reply, action } = parseAction(finalContent);

    // Send final message with parsed action
    res.write(`data: ${JSON.stringify({ done: true, reply, action })}\n\n`);
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
