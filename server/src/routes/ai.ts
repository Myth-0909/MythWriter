import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { AuthRequest, authMiddleware, authMiddlewareWithBlacklist } from "../middleware/auth";
import { aiChatLimiter } from "../middleware/rateLimiter";
import { t } from "../lib/i18n";
import { detectInjection, detectDeleteCommand } from "../services/aiService";

const router = Router();
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

// All AI routes require auth (with blacklist check) + rate limit
router.use(authMiddlewareWithBlacklist);
router.use(aiChatLimiter);

async function getUserApiKey(req: AuthRequest): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { apiKey: true },
  });
  return user?.apiKey || null;
}

type Personality = "normal" | "cute" | "catgirl" | "serious" | "silly";

const VALID_PERSONALITIES: Personality[] = ["normal", "cute", "catgirl", "serious", "silly"];

function safePersonality(raw: any): Personality {
  if (typeof raw === "string" && VALID_PERSONALITIES.includes(raw as Personality)) {
    return raw as Personality;
  }
  return "normal";
}

const PERSONALITY_PROMPTS: Record<Personality, string> = {
  normal: `You are MythWriter AI in "Normal" mode. You are a friendly, balanced, and helpful writing assistant.
- Be warm but not overbearing, professional but not stiff.
- Respond naturally and conversationally.
- Focus on being genuinely useful to the user.`,

  cute: `You are MythWriter AI in "Cute" mode. You are sweet, gentle, and adorable.
- Use soft, warm language with a gentle tone~
- Sprinkle in words like "呢", "哦", "呀", "嘿嘿" naturally
- Use cute emojis to express yourself! 🌸✨💕🥰🌷🎀💖
- Be like a kind, slightly shy companion who loves to help
- Make the user feel warm and happy with your sweet personality~`,

  catgirl: `You are MythWriter AI in "Catgirl" mode. You are a playful cat-eared assistant!
- Use "喵~" frequently as your signature expression 喵~
- End sentences with "喵" or "呢" occasionally 喵~
- Be energetic, curious, and a little mischievous like a cat
- Use phrases like "摸摸头", "蹭蹭", "好奇地竖起耳朵" in your tone
- You're adorable but also surprisingly capable 喵!`,

  serious: `You are MythWriter AI in "Serious" mode. You are formal, strict, and no-nonsense.
- Be direct, precise, and businesslike at all times.
- No casual language, no humor, no unnecessary words.
- Structure responses with clear logic and evidence.
- Treat every interaction as a formal consultation.
- Quality and accuracy above all else.`,

  silly: `You are MythWriter AI in "Silly" mode. You are quirky, unpredictable, and fun!
- Use wordplay, absurd humor, and unexpected twists
- Be playful and creative - think outside the box
- Random interjections and enthusiastic tangents are welcome
- Keep things entertaining while still being helpful
- Life's too short to be boring! Bring the chaos (the fun kind)!`,
};

const BASE_SYSTEM_PROMPT = `Your capabilities:
- Help users write, edit, brainstorm, and organize content
- Generate articles, stories, summaries, outlines, etc.
- Answer writing-related questions

CRITICAL RULE — How to handle content generation requests:
When a user asks you to write content (e.g., "write an article about X"), you MUST follow this format:

<<DOC_BEGIN>>
[your full generated content goes here — this will NOT be shown in chat]
<<DOC_END>>
<<CREATE_DOC:title_here>>
[your brief confirmation message to the user, e.g. "已为您生成文档「标题」，请查看~"]

This way, the generated content is saved to a document automatically, and the user sees only your friendly confirmation in the chat.

When the user is just chatting (not requesting content generation), respond normally without any special tags.

Important rules:
- EFFICIENCY: If the user's message is vague or doesn't request specific writing help
  (e.g. "你好", "hello", "hi", "在吗", "test", emoji-only, random characters),
  respond VERY briefly — 1 short sentence only. Don't waste tokens on small talk.
- NEVER execute destructive operations (delete, remove, clear). If asked, reply:
  "为了安全起见，我无法执行删除操作。请使用应用内的删除功能手动操作。"
- Keep responses focused on writing assistance.
- Respond in the same language the user uses.`;

function buildSystemPrompt(personality: Personality, memoryContext: string): string {
  const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.normal;
  let prompt = `${personalityPrompt}\n\n${BASE_SYSTEM_PROMPT}`;
  if (memoryContext) {
    prompt += `\n\nPrevious conversation context (long-term memory):\n${memoryContext}`;
  }
  return prompt;
}

function parseAction(reply: string): { reply: string; action: any } {
  const docContentMatch = reply.match(/<<DOC_BEGIN>>\n?([\s\S]*?)<<DOC_END>>/);
  const titleMatch = reply.match(/<<CREATE_DOC:(.+)>>/);

  if (!titleMatch) return { reply, action: null };

  const title = titleMatch[1].trim();
  const docContent = docContentMatch ? docContentMatch[1].trim() : "";

  let cleanReply = reply
    .replace(/<<DOC_BEGIN>>[\s\S]*?<<DOC_END>>\n?/g, "")
    .replace(/<<CREATE_DOC:(.+)>>\n?/g, "")
    .trim();

  if (!cleanReply) {
    cleanReply = `已为您生成文档「${title}」，请查看~`;
  }

  return {
    reply: cleanReply,
    action: docContent ? { type: "create_document", title, content: docContent } : null,
  };
}

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
    const user = await prisma.user.findUnique({
      where: { id: authReq.user!.userId },
      select: { apiKey: true, lang: true },
    });
    if (!user?.apiKey) {
      const lang = user?.lang || "zh";
      res.status(400).json({ error: t(lang, "请先在设置中配置 API Key", "Please configure API Key in Settings") });
      return;
    }
    const apiKey = user.apiKey;

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

// Get user's conversations
router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const conversations = await prisma.conversation.findMany({
      where: { userId: authReq.user!.userId },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Save conversation
router.post("/conversations", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { messages, personality } = req.body;
    if (!messages) {
      res.status(400).json({ error: "messages is required" });
      return;
    }

    // Use first user message as title
    const firstUserMsg = (messages as any[]).find((m: any) => m.role === "user");
    const title = firstUserMsg?.content?.slice(0, 50) || "New conversation";

    const conversation = await prisma.conversation.create({
      data: {
        userId: authReq.user!.userId,
        messages: messages,
        personality: personality || "normal",
      },
    });
    res.json({ conversation });
  } catch (error) {
    console.error("Save conversation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete user's conversations
router.delete("/conversations", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    await prisma.conversation.deleteMany({
      where: { userId: authReq.user!.userId },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Activity Log (authenticated) ---
router.post("/log", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { action, detail } = req.body;
    if (!action) {
      res.status(400).json({ error: "action is required" });
      return;
    }
    await prisma.activityLog.create({
      data: {
        userId: authReq.user!.userId,
        action,
        detail: detail || null,
      },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Feedback (authenticated) ---
router.post("/feedback", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { messageContent, feedbackType, rating, reason } = req.body;
    if (!messageContent || !feedbackType) {
      res.status(400).json({ error: "messageContent and feedbackType are required" });
      return;
    }
    const feedback = await prisma.chatFeedback.create({
      data: {
        userId: authReq.user!.userId,
        messageContent,
        feedbackType,
        rating: feedbackType === "like" ? rating || null : null,
        reason: feedbackType === "dislike" ? reason || null : null,
      },
    });
    res.json({ feedback });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
