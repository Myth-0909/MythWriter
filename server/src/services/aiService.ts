export type Personality = "normal" | "cute" | "catgirl" | "serious" | "silly";

const VALID_PERSONALITIES: Personality[] = ["normal", "cute", "catgirl", "serious", "silly"];

export function safePersonality(raw: any): Personality {
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

export function buildSystemPrompt(personality: Personality, memoryContext: string): string {
  const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.normal;
  let prompt = `${personalityPrompt}\n\n${BASE_SYSTEM_PROMPT}`;
  if (memoryContext) {
    prompt += `\n\nPrevious conversation context (long-term memory):\n${memoryContext}`;
  }
  return prompt;
}

export function parseAction(reply: string): { reply: string; action: any } {
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

const DELETE_KEYWORDS = ["删除", "删掉", "移除", "清空", "delete", "remove", "clear", "erase", "trash"];

export function detectDeleteCommand(content: string): boolean {
  return DELETE_KEYWORDS.some((kw) => content.includes(kw));
}
