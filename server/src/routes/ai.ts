import { Router, Request, Response } from "express";
import { AuthRequest, authMiddleware, authMiddlewareWithBlacklist } from "../middleware/auth";
import { aiChatLimiter } from "../middleware/rateLimiter";
import { t } from "../lib/i18n";
import {
  buildSystemPrompt, detectDeleteCommand, detectInjection,
  parseAction, safePersonality, getUserApiKey,
  listConversations, saveConversation, deleteConversations,
  logActivity, saveFeedback,
} from "../services/aiService";
import type { Personality } from "../services/aiService";

const router = Router();
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

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
    const { messages, personality, memoryContext } = req.body;

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

      if (detectDeleteCommand(content)) {
        res.json({
          reply: "为了安全起见，我无法执行删除操作。请使用应用内的删除功能手动操作。",
          action: null,
        });
        return;
      }
    }

    const authReq = req as AuthRequest;
    const { apiKey, lang: userLang } = await getUserApiKey(authReq.user!.userId);
    if (!apiKey) {
      res.status(400).json({ error: t(userLang, "请先在设置中配置 API Key", "Please configure API Key in Settings") });
      return;
    }

    const pers = safePersonality(personality);
    const systemPrompt = buildSystemPrompt(pers, memoryContext || "");

    // Use streaming
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("DeepSeek API error:", response.status, errText);
      res.status(502).json({ error: "AI service unavailable" });
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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              // Send the delta to client
              res.write(`data: ${JSON.stringify({ delta })}\n\n`);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } catch (err) {
      console.error("Stream read error:", err);
    }

    // Parse final response for actions
    const { reply, action } = parseAction(fullContent);

    // Send final message with parsed action
    res.write(`data: ${JSON.stringify({ done: true, reply, action })}\n\n`);
    res.end();
  } catch (error) {
    console.error("AI route error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
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
