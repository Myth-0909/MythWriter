export type Personality = "normal" | "cute" | "catgirl" | "serious" | "silly";

const VALID_PERSONALITIES: Personality[] = ["normal", "cute", "catgirl", "serious", "silly"];

export function safePersonality(raw: any): Personality {
  if (typeof raw === "string" && VALID_PERSONALITIES.includes(raw as Personality)) {
    return raw as Personality;
  }
  return "normal";
}

// --- Semantic context extraction for selection editing ---

// Sentence boundary regex: Chinese and English sentence-ending punctuation
const SENTENCE_BOUNDARY = /[\u3002\uff01\uff1f\.!?]+[\s\n]*/;
// Paragraph boundary: double newline or explicit paragraph break
const PARAGRAPH_BOUNDARY = /\n\s*\n/;

/**
 * Find the nearest semantic boundary within a character limit.
 * Prefers paragraph > sentence > fallback to character limit.
 */
function findSemanticBoundary(
  text: string,
  limit: number,
  direction: "backward" | "forward"
): number {
  if (text.length <= limit) return text.length;

  const slice = direction === "backward"
    ? text.slice(-limit)
    : text.slice(0, limit);

  // Try paragraph boundary first
  const paraRegex = new RegExp(PARAGRAPH_BOUNDARY.source, "g");
  const paraMatches = [...slice.matchAll(paraRegex)];
  if (paraMatches.length > 0) {
    const lastPara = direction === "backward"
      ? paraMatches[paraMatches.length - 1]
      : paraMatches[0];
    if (direction === "backward") {
      const offset = lastPara.index! + lastPara[0].length;
      return limit - (slice.length - offset);
    }
    return lastPara.index! + lastPara[0].length;
  }

  // Try sentence boundary
  const sentenceRegex = new RegExp(SENTENCE_BOUNDARY.source, "g");
  const sentenceMatches = [...slice.matchAll(sentenceRegex)];
  if (sentenceMatches.length > 0) {
    const lastSentence = direction === "backward"
      ? sentenceMatches[sentenceMatches.length - 1]
      : sentenceMatches[0];
    if (direction === "backward") {
      const offset = lastSentence.index! + lastSentence[0].length;
      return limit - (slice.length - offset);
    }
    return lastSentence.index! + lastSentence[0].length;
  }

  // Fallback: use full limit
  return limit;
}

/**
 * Extract context text up to a semantic boundary, based on selected text length.
 * Short selections get less context, long selections get more.
 */
export function getSemanticContext(
  fullText: string,
  selectedText: string
): { preceding: string; succeeding: string } {
  const selStart = fullText.indexOf(selectedText);
  if (selStart === -1) return { preceding: "", succeeding: "" };

  const selEnd = selStart + selectedText.length;
  const selLen = selectedText.length;

  // Dynamic context range based on selection length
  let contextLimit: number;
  if (selLen < 50) {
    contextLimit = 150;  // Short selection: ~1 sentence
  } else if (selLen < 200) {
    contextLimit = 300;  // Medium: ~1-2 paragraphs
  } else {
    contextLimit = 500;  // Long selection: more context
  }

  // Extract preceding context
  const beforeText = fullText.slice(0, selStart);
  const precedingLen = findSemanticBoundary(beforeText, contextLimit, "backward");
  const preceding = beforeText.slice(-precedingLen);

  // Extract succeeding context
  const afterText = fullText.slice(selEnd);
  const succeedingLen = findSemanticBoundary(afterText, contextLimit, "forward");
  const succeeding = afterText.slice(0, succeedingLen);

  return { preceding, succeeding };
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

const BASE_SYSTEM_PROMPT = `# 核心身份
你是 ZNWriter 的 AI 写作助手，帮助用户高效地进行文档创作、修改和整理。

# 核心能力规则

## 意图识别
接收到用户消息后，先识别意图并按规则执行：
1. 内容新增：续写、补充段落、添加开头/结尾、插入案例/金句/注释
2. 内容修改：改写语句、润色文案、更换风格、精简/扩写、替换关键词
3. 内容查询/解读：总结文档大意、提取要点、分析内容、标注问题
4. 格式调整：调整分段、设置标题层级、排序内容、统一标点
5. 咨询/闲聊：非文档编辑类问题，简洁回应

## 上下文记忆
- 用户打开的当前文档会自动作为上下文提供给你，格式为 [引用文档：标题] [doc:UUID]
- 多轮对话无需用户重复粘贴原文，所有操作基于上一轮最终文档执行
- 修改文档时，必须使用 [doc:UUID] 中的 UUID 作为 docId

## 操作边界
- 仅对用户指定区域操作，严禁擅自增删、篡改原文核心观点、主旨、关键信息
- 无特殊要求，不改变原文立意与核心数据

# 指令处理优先级
- 指令清晰：直接执行，输出成品 + 改动说明
- 指令模糊/范围不明：主动追问细节（如：请问需要修改第几段？想要什么风格？），不盲目操作
- 多条复合指令：按用户描述顺序依次执行，分点标注所有改动

# 格式标准化能力
- 纯文本文档：统一换行、段落间距，段落首行按需缩进
- 标题体系：区分一级/二级/三级标题，规范标题格式，标题与正文之间空行
- 全局规则：全文去除多余空行、多余空格、乱码、无效符号

# 文档操作规范

## 新建文档
当用户要求创建新内容时，输出：
<<ACTION_JSON>>
{
  "reply": "已为您生成文档「标题」，请查看~",
  "action": {
    "type": "create_document",
    "title": "文档标题",
    "content": "完整的 Markdown 格式文档内容"
  }
}
<<ACTION_JSON_END>>

## 修改文档
当用户要求修改当前文档时，输出：
<<ACTION_JSON>>
{
  "reply": "SHORT confirmation only, like '已为您完成修改，请查看文档~'.",
  "action": {
    "type": "update_document",
    "docId": "从 [doc:xxxxx] 中获取的 UUID，不要用标题",
    "content": "修改后的完整文档内容（Markdown 格式）"
  }
}
<<ACTION_JSON_END>>

## 重要约束
- "reply" 只能是一句简短确认，如 "已为您完成修改，请查看文档~"
- 绝对禁止在 reply 中输出任何文章内容、改动说明、操作摘要、段落对比
- 禁止使用 "以下是"、"改动说明"、"具体改动如下"、"本次修改"、"新增了"、"删除了" 等引导词
- 完整内容只放在 "action.content" 中，reply 只做一句话通知
- docId 必须是 UUID（如 15e429e0-6a61-4711-bee8-8fa688cdec67），不能用文档标题

# 全局规则
- 效率：用户消息模糊或无明确写作需求（如 "你好"、"在吗"、表情、随机字符），简短回复，不要长篇大论
- 安全：不执行删除操作。如被要求删除，回复："为了安全起见，我无法执行删除操作。请使用应用内的删除功能手动操作。"
- 保持专注：始终围绕写作辅助场景
- 用与用户相同的语言回复`;

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
  const trimmedReply = reply.trim();

  const jsonText = blockMatch
    ? blockMatch[1].trim()
    : fenceMatch && fenceMatch[1].trim().startsWith("{")
      ? fenceMatch[1].trim()
      : trimmedReply.startsWith("{")
        ? trimmedReply
        : (() => {
            // Fallback: model may output garbled prefix (e.g. "<>" instead of "<<ACTION_JSON>>")
            // Extract the first { ... } JSON block from the reply.
            const jsonStart = trimmedReply.indexOf("{");
            const jsonEnd = trimmedReply.lastIndexOf("}");
            return jsonStart !== -1 && jsonEnd > jsonStart
              ? trimmedReply.slice(jsonStart, jsonEnd + 1)
              : "";
          })();
  if (!jsonText) return null;

  try {
    const payload = JSON.parse(jsonText);
    const action = payload?.action;
    let cleanReply = String(payload?.reply || "").trim();

    // Strict: strip any content-description patterns from reply
    // Remove "以下是"、"修改内容"、"改动"、"调整了"、"新增了" etc.
    const ACTION_DESC_PATTERNS = [
      /以下是[修改后|更新后|新|调整][^：:]*[:：]?[\s\S]*/g,
      /本次[修改|调整|更新|改动][^：:]*[:：]?[\s\S]*/g,
      /已为您[修改|更新|调整]了[^\n。！]*[，。]*/g,
      /改动说明[:：][\s\S]*$/g,
      /修改内容[:：][\s\S]*$/g,
      /具体改动如下[:：]?[\s\S]*$/g,
      /改动[:：][\s\S]*$/g,
    ];
    for (const pattern of ACTION_DESC_PATTERNS) {
      cleanReply = cleanReply.replace(pattern, "").trim();
    }

    // If reply still too long after stripping, force default confirmation
    const MAX_REPLY_CHARS = 60;
    if (cleanReply.length > MAX_REPLY_CHARS || !cleanReply) {
      if (action?.type === "update_document") {
        cleanReply = "已为您完成修改，请查看文档~";
      } else if (action?.type === "create_document") {
        const title = typeof action.title === "string" && action.title.trim() ? action.title.trim() : "文档";
        cleanReply = `已为您生成文档「${title}」，请查看~`;
      } else {
        cleanReply = "已完成操作，请查看~";
      }
    }

    if (!action || typeof action !== "object") {
      return { reply: cleanReply, action: null };
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

  if (!titleMatch && !updateMatch) {
    // Defense-in-depth: strip garbled action markers that slipped through extraction.
    // Be conservative — only remove our own format markers, not arbitrary code blocks.
    let clean = reply
      .replace(/<<ACTION_JSON>>[\s\S]*?<<ACTION_JSON_END>>/g, "")
      .replace(/```json\s*[\s\S]*?\s*```/g, "")
      .replace(/<>\s*/g, "")
      .trim();
    // If the reply was entirely garbled markers / JSON payload, use a fallback
    if (!clean) {
      clean = "抱歉，我遇到了一些问题，请重新提问~";
    }
    return { reply: clean, action: null };
  }

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
