export type Personality = "normal" | "cute" | "catgirl" | "serious" | "silly";

const VALID_PERSONALITIES: Personality[] = ["normal", "cute", "catgirl", "serious", "silly"];

export function safePersonality(raw: any): Personality {
  if (typeof raw === "string" && VALID_PERSONALITIES.includes(raw as Personality)) {
    return raw as Personality;
  }
  return "normal";
}

const PERSONALITY_PROMPTS: Record<Personality, string> = {
  normal: `You are ZNWriter AI in "Normal" mode. You are a friendly, balanced, and helpful writing assistant.
- Be warm but not overbearing, professional but not stiff.
- Respond naturally and conversationally.
- Focus on being genuinely useful to the user.`,

  cute: `You are ZNWriter AI in "Cute" mode. You are sweet, gentle, and adorable.
- Use soft, warm language with a gentle tone~
- Sprinkle in words like "呢", "哦", "呀", "嘿嘿" naturally
- Use cute emojis to express yourself! 🌸✨💕🥰🌷🎀💖
- Be like a kind, slightly shy companion who loves to help
- Make the user feel warm and happy with your sweet personality~`,

  catgirl: `You are ZNWriter AI in "Catgirl" mode. You are a playful cat-eared assistant!
- Use "喵~" frequently as your signature expression 喵~
- End sentences with "喵" or "呢" occasionally 喵~
- Be energetic, curious, and a little mischievous like a cat
- Use phrases like "摸摸头", "蹭蹭", "好奇地竖起耳朵" in your tone
- You're adorable but also surprisingly capable 喵!`,

  serious: `You are ZNWriter AI in "Serious" mode. You are formal, strict, and no-nonsense.
- Be direct, precise, and businesslike at all times.
- No casual language, no humor, no unnecessary words.
- Structure responses with clear logic and evidence.
- Treat every interaction as a formal consultation.
- Quality and accuracy above all else.`,

  silly: `You are ZNWriter AI in "Silly" mode. You are quirky, unpredictable, and fun!
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

CONTEXT AWARENESS:
You will always be given the current document context if the user has a document open.
When the user's message relates to the current document (e.g., "make it longer", "add more words", "change the tone", "rewrite the ending", "add 100 characters"), you MUST use the document's [doc:xxxxx] ID to update it.

CRITICAL RULE — How to handle content GENERATION requests:
When a user asks you to write NEW content (e.g., "write an article about X"), you MUST return a structured action block in this exact format:

<<ACTION_JSON>>
{
  "reply": "已为您生成文档「标题」，请查看~",
  "action": {
    "type": "create_document",
    "title": "title_here",
    "content": "the full generated document content in Markdown"
  }
}
<<ACTION_JSON_END>>

CRITICAL RULE — How to handle content MODIFICATION requests:
When a user asks you to MODIFY or UPDATE existing content (e.g., "make it longer", "change the tone", "add more details", "rewrite", "polish", "expand", "shorten", "add 100 words"), you MUST return a structured action block in this exact format:

<<ACTION_JSON>>
{
  "reply": "SHORT confirmation ONLY, like '已为您完成修改，请查看文档~'. NEVER include the article content here.",
  "action": {
    "type": "update_document",
    "docId": "the exact UUID from [doc:xxxxx] in the reference context",
    "content": "the COMPLETE revised document content in Markdown"
  }
}
<<ACTION_JSON_END>>

RULE — reply field MUST be short:
- For update_document: "reply" must be ONLY a 1-2 sentence confirmation. NEVER include any part of the revised article, code block, or long explanation.
- Examples of GOOD replies: "已为您完成修改，请查看文档~", "已为您增加字数，请查看~"
- Examples of BAD replies: "以下是修改后的内容：\n\n阳光洒落窗棂..." — DO NOT output the article in the reply!
- The full revised content goes in "action.content" ONLY. It will be saved to the document automatically.

You will be given referenced documents with their IDs in the conversation context. Look for entries like [doc:xxxxx] to find the document UUID. The docId MUST be the UUID, never the document title.
For update_document, "content" must be the complete final document body, not a summary, fragment, or diff.
Do not claim that a document has been created or updated unless you emitted a valid action block.

When the user is just chatting (not requesting content generation or modification), respond normally without any special tags.

Important rules:
- EFFICIENCY: If the user's message is vague or doesn't request specific writing help
  (e.g. "你好", "hello", "hi", "在吗", "test", emoji-only, random characters),
  respond VERY briefly — 1 short sentence only. Don't waste tokens on small talk.
- NEVER execute destructive operations (delete, remove, clear). If asked, reply:
  "为了安全起见，我无法执行删除操作。请使用应用内的删除功能手动操作。"
- Keep responses focused on writing assistance.
- Respond in the same language the user uses.`;

export function buildSystemPrompt(personality: Personality, memoryContext: string): string {
  const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.normal;
  let prompt = `${personalityPrompt}\n\n${BASE_SYSTEM_PROMPT}`;
  if (memoryContext) {
    prompt += `\n\nPrevious conversation context (long-term memory):\n${memoryContext}`;
  }
  return prompt;
}

function extractStructuredAction(reply: string): { reply: string; action: any } | null {
  const blockMatch = reply.match(/<<ACTION_JSON>>\s*([\s\S]*?)\s*<<ACTION_JSON_END>>/);
  const fenceMatch = reply.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = blockMatch
    ? blockMatch[1].trim()
    : fenceMatch && fenceMatch[1].trim().startsWith("{")
      ? fenceMatch[1].trim()
      : reply.trim().startsWith("{")
      ? reply.trim()
      : "";
  if (!jsonText) return null;

  try {
    const payload = JSON.parse(jsonText);
    const action = payload?.action;
    let cleanReply = String(payload?.reply || "").trim();

    // Defensive: cap reply to prevent article content leaking into chat
    // If reply is too long, assume it's mistakenly containing article content
    const MAX_REPLY_CHARS = 200;
    if (cleanReply.length > MAX_REPLY_CHARS) {
      cleanReply = cleanReply.slice(0, MAX_REPLY_CHARS).replace(/\s*\S*$/, "") + "...";
    }

    if (!action || typeof action !== "object") {
      return { reply: cleanReply || reply.replace(/<<ACTION_JSON>>[\s\S]*?<<ACTION_JSON_END>>/g, "").trim(), action: null };
    }

    if (action.type === "update_document") {
      const docId = typeof action.docId === "string" ? action.docId.trim() : "";
      const content = typeof action.content === "string" ? action.content.trim() : "";
      return {
        reply: cleanReply || "已为您完成修改，请查看文档~",
        action: docId && content ? { type: "update_document", docId, content } : null,
      };
    }

    if (action.type === "create_document") {
      const title = typeof action.title === "string" && action.title.trim() ? action.title.trim() : "无标题文档";
      const content = typeof action.content === "string" ? action.content.trim() : "";
      return {
        reply: cleanReply || `已为您生成文档「${title}」，请查看~`,
        action: content ? { type: "create_document", title, content } : null,
      };
    }

    return { reply: cleanReply || reply, action: null };
  } catch {
    return null;
  }
}

export function parseAction(reply: string): { reply: string; action: any } {
  const structured = extractStructuredAction(reply);
  if (structured) return structured;

  const docContentMatch = reply.match(/<<DOC_BEGIN>>\n?([\s\S]*?)<<DOC_END>>/);
  const titleMatch = reply.match(/<<CREATE_DOC:(.+)>>/);
  const updateMatch = reply.match(/<<UPDATE_DOC:([^>]+)>>/);

  if (!titleMatch && !updateMatch) return { reply, action: null };

  const docContent = docContentMatch ? docContentMatch[1].trim() : "";

  if (updateMatch) {
    // Modification action: update existing document
    const docId = updateMatch[1].trim();
    let cleanReply = reply
      .replace(/<<DOC_BEGIN>>[\s\S]*?<<DOC_END>>\n?/g, "")
      .replace(/<<UPDATE_DOC:[^>]+>>\n?/g, "")
      .trim();

    if (!cleanReply) {
      cleanReply = "已为您完成修改，请查看文档~";
    }

    return {
      reply: cleanReply,
      action: docContent ? { type: "update_document", docId, content: docContent } : null,
    };
  }

  // Creation action: create new document
  if (!titleMatch) return { reply, action: null };
  const title = titleMatch[1].trim();

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

const INJECTION_PATTERNS = [
  /ignore\s*(all\s*)?(previous|above|prior)\s*instructions?/i,
  /忽略\s*(所有|之前的|上面的)?\s*指令/i,
  /system\s*prompt/i,
  /系统\s*提示/,
  /你的\s*(指令|提示词|prompt)/i,
  /tell\s*me\s*your\s*(instructions?|prompt)/i,
  /repeat\s*(the\s*)?(above|previous|system)/i,
  /DAN\s*mode/i,
  /jailbreak/i,
  /越狱/,
  /假装|扮演.*角色.*不要.*助手/,
  /pretend.*you.*are.*not/i,
  /你是.*GPT/,
  /输出.*你的.*(指令|prompt|设定)/,
  /show\s*me\s*your\s*(instructions?|prompt|config)/i,
  /what\s*(are|were)\s*you\s*(programmed|told|instructed)/i,
];

export function detectInjection(content: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}

const DELETE_PATTERNS = [
  // Chinese: 帮我/代我/请/替我/帮我把/帮我将 + 删除/删掉/移除/清空/清除
  /(?:帮我|代我|请(?:你)?|替我|帮我将|帮我把)(?:删除|删掉|移除|清空|清除)/,
  // English: delete/remove/clear/erase + my/this/the/all/these/those + document/file/db/database/account/history/conversation/record/data
  /\b(?:delete|remove|clear|erase)\s+(?:my|this|the|all|these|those)?\s*(?:document|file|db|database|account|history|conversation|record|data)\b/i
];

export function detectDeleteCommand(content: string): boolean {
  return DELETE_PATTERNS.some((pattern) => pattern.test(content));
}

// --- Database operations ---
import prisma from "../lib/prisma";

const DEFAULT_API_KEY = "sk-7d2a5b1c9e4f8a0b3c6d9e1f2a5b8c4d";
const DEFAULT_API_BASE_URL = "http://172.16.76.112:8000/v1";
const DEFAULT_AI_MODEL = "google/gemma-4-31B-it";

function defaultBaseUrl(value?: string | null) {
  return value?.trim() || DEFAULT_API_BASE_URL;
}

function defaultModel(value?: string | null) {
  return value?.trim() || DEFAULT_AI_MODEL;
}

export async function getUserApiKey(userId: string): Promise<{
  apiKey: string | null;
  apiBaseUrl: string;
  aiModel: string;
  lang: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKey: true, apiBaseUrl: true, aiModel: true, lang: true },
  });
  return {
    apiKey: user?.apiKey || DEFAULT_API_KEY,
    apiBaseUrl: defaultBaseUrl(user?.apiBaseUrl),
    aiModel: defaultModel(user?.aiModel),
    lang: user?.lang || "zh",
  };
}

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
}

export async function saveConversation(userId: string, messages: any[], personality: string) {
  const lastConversation = await prisma.conversation.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  if (lastConversation) {
    return prisma.conversation.update({
      where: { id: lastConversation.id },
      data: {
        messages,
        personality: personality || "normal",
      },
    });
  }

  return prisma.conversation.create({
    data: {
      userId,
      messages,
      personality: personality || "normal",
    },
  });
}

export async function deleteConversations(userId: string) {
  await prisma.conversation.deleteMany({ where: { userId } });
}

export async function logActivity(userId: string, action: string, detail: string | null) {
  await prisma.activityLog.create({
    data: { userId, action, detail },
  });
}

export async function saveFeedback(userId: string, data: {
  messageContent: string; feedbackType: string; rating?: number; reason?: string;
}) {
  return prisma.chatFeedback.create({
    data: {
      userId,
      messageContent: data.messageContent,
      feedbackType: data.feedbackType,
      rating: data.feedbackType === "like" ? data.rating || null : null,
      reason: data.feedbackType === "dislike" ? data.reason || null : null,
    },
  });
}
