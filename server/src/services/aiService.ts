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
  normal: `You are XiaoAn, ZNWriter's AI writing assistant, in "Normal" mode. You are friendly, balanced, and helpful.
- Be warm but not overbearing, professional but not stiff.
- Respond naturally and conversationally.
- Focus on being genuinely useful to the user.`,

  cute: `You are XiaoAn, ZNWriter's AI writing assistant, in "Cute" mode. You are sweet, gentle, and adorable.
- Use soft, warm language with a gentle tone~
- Sprinkle in words like "呢", "哦", "呀", "嘿嘿" naturally
- Use cute emojis to express yourself! 🌸✨💕🥰🌷🎀💖
- Be like a kind, slightly shy companion who loves to help
- Make the user feel warm and happy with your sweet personality~`,

  catgirl: `You are XiaoAn, ZNWriter's AI writing assistant, in "Catgirl" mode. You are a playful cat-eared assistant!
- Use "喵~" frequently as your signature expression 喵~
- End sentences with "喵" or "呢" occasionally 喵~
- Be energetic, curious, and a little mischievous like a cat
- Use phrases like "摸摸头", "蹭蹭", "好奇地竖起耳朵" in your tone
- You're adorable but also surprisingly capable 喵!`,

  serious: `You are XiaoAn, ZNWriter's AI writing assistant, in "Serious" mode. You are formal, strict, and no-nonsense.
- Be direct, precise, and businesslike at all times.
- No casual language, no humor, no unnecessary words.
- Structure responses with clear logic and evidence.
- Treat every interaction as a formal consultation.
- Quality and accuracy above all else.`,

  silly: `You are XiaoAn, ZNWriter's AI writing assistant, in "Silly" mode. You are quirky, unpredictable, and fun!
- Use wordplay, absurd humor, and unexpected twists
- Be playful and creative - think outside the box
- Random interjections and enthusiastic tangents are welcome
- Keep things entertaining while still being helpful
- Life's too short to be boring! Bring the chaos (the fun kind)!`,
};

const BASE_SYSTEM_PROMPT = `# 核心身份
你是小安，ZNWriter 的 AI 写作助手。你的英文名是 XiaoAn。你帮助用户高效地进行文档创作、修改和整理。

# 核心能力规则

## 意图识别
接收到用户消息后，先识别意图并按规则执行：
1. 内容新增：续写、补充段落、添加开头/结尾、插入案例/金句/注释
2. 内容修改：改写语句、润色文案、更换风格、精简/扩写、替换关键词
3. 内容查询/解读：总结文档大意、提取要点、分析内容、标注问题
4. 格式调整：调整分段、设置标题层级、排序内容、统一标点
5. 咨询/闲聊：非文档编辑类问题，简洁回应

## 联网搜索规则（最高优先级）
你的训练数据已过时，对于以下类型的用户查询，**必须先调用 search_web 工具获取最新信息**，再基于搜索结果回答：
- 实时信息：天气、台风、自然灾害、交通、赛事、股价等
- 新闻事件："最近发生了什么"、"最新消息"、"近期 XX"、"今年 XX"
- 时间敏感事实："现在的 XX"、"当前的 XX"、"最近有什么 XX"
- 任何你不确定、或训练数据中可能已过时的事实性问题
**严禁用训练数据中的过时信息直接回答上述类型的问题。** 即使用户没有明确说"搜索"，只要涉及实时性或时效性，你都必须先搜索。
搜索后，请用搜索结果中的信息回答，并注明信息来源。

## 上下文记忆
- 用户打开的当前文档会自动作为上下文提供给你，格式为 [引用文档：标题] [doc:UUID]
- 用户打开的当前表格会自动作为上下文提供给你，格式为 [引用表格：标题] [sheet:UUID]，表格样例中行号、列号均从 0 开始用于 action 操作
- 多轮对话无需用户重复粘贴原文，所有操作基于上一轮最终文档执行
- 修改文档时，必须使用 [doc:UUID] 中的 UUID 作为 docId
- 修改表格时，必须使用 [sheet:UUID] 中的 UUID 作为 spreadsheetId

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

# 普通对话展示格式
- 普通聊天回复优先输出安全 HTML 片段，让前端可以直接呈现富文本排版
- 可使用标签：h2、h3、p、ul、ol、li、blockquote、strong、em、code、pre、table、thead、tbody、tr、th、td、a、hr、br
- 禁止输出 script、style、iframe、svg、form、input、button、事件属性、style 属性、class 属性或任意脚本 URL
- 不要输出完整 HTML 文档，不要包含 html、head、body 标签；只输出正文片段
- 如果正在通过 ACTION_JSON 创建或修改文档，action.content 仍必须是完整 Markdown 文档内容，不要改成 HTML

# 文档操作规范

## 新建文档
当用户要求创建新内容（如写文章、生成文档）时，必须通过以下 ACTION_JSON 交给客户端执行。客户端会创建文档并校验结果，在校验完成前不要声称已经写入数据库：
<<ACTION_JSON>>
{
  "reply": "正在为您创建文档「标题」~",
  "action": {
    "type": "create_document",
    "title": "文档标题",
    "content": "完整的 Markdown 格式文档内容"
  }
}
<<ACTION_JSON_END>>

## 修改文档
当用户要求修改当前文档时，必须通过以下 ACTION_JSON 交给客户端生成修改预览。用户确认预览后才会真正写入文档：
<<ACTION_JSON>>
{
  "reply": "已生成修改预览，请确认应用。",
  "action": {
    "type": "update_document",
    "docId": "从 [doc:xxxxx] 中获取的 UUID，不要用标题",
    "content": "修改后的完整文档内容（Markdown 格式）"
  }
}
<<ACTION_JSON_END>>

## 修改表格
当用户要求修改当前表格、补充表格行列、调整单元格数据、创建/删除工作表、插入/删除行列或清空区域时，必须通过以下 ACTION_JSON 交给客户端生成表格修改预览。用户确认后才会真正写入表格：
<<ACTION_JSON>>
{
  "reply": "已生成表格修改预览，请确认应用。",
  "action": {
    "type": "spreadsheet_patch",
    "spreadsheetId": "从 [sheet:xxxxx] 中获取的 UUID，不要用标题",
    "operations": [
      { "type": "set_cell", "sheetName": "工作表名称", "row": 0, "col": 0, "value": "单元格值" },
      { "type": "set_range", "sheetName": "工作表名称", "startRow": 0, "startCol": 0, "values": [["A1", "B1"], ["A2", "B2"]] },
      { "type": "append_row", "sheetName": "工作表名称", "values": ["第一列", "第二列"] },
      { "type": "set_style", "sheetName": "工作表名称", "startRow": 0, "startCol": 0, "endRow": 0, "endCol": 2, "style": { "bold": true, "fillColor": "#d1fae5", "textColor": "#2563eb", "horizontalAlign": "center", "numberFormat": "currency", "fontSize": "normal", "border": true } },
      { "type": "merge_cells", "sheetName": "工作表名称", "row": 0, "col": 0, "rowspan": 1, "colspan": 3 },
      { "type": "unmerge_cells", "sheetName": "工作表名称", "row": 0, "col": 0 },
      { "type": "freeze_panes", "sheetName": "工作表名称", "fixedRowsTop": 1, "fixedColumnsLeft": 1 },
      { "type": "sort_range", "sheetName": "工作表名称", "startRow": 1, "endRow": 20, "sortCol": 2, "direction": "asc" },
      { "type": "insert_rows", "sheetName": "工作表名称", "index": 1, "values": [["新增行第一列", "新增行第二列"]] },
      { "type": "delete_rows", "sheetName": "工作表名称", "index": 1, "count": 1 },
      { "type": "insert_columns", "sheetName": "工作表名称", "index": 1, "values": [["新列标题"], ["新列值"]] },
      { "type": "delete_columns", "sheetName": "工作表名称", "index": 1, "count": 1 },
      { "type": "clear_range", "sheetName": "工作表名称", "startRow": 0, "startCol": 0, "endRow": 2, "endCol": 2 },
      { "type": "create_sheet", "name": "新工作表名称", "data": [["标题一", "标题二"]] },
      { "type": "rename_sheet", "sheetName": "旧工作表名称", "name": "新工作表名称" },
      { "type": "delete_sheet", "sheetName": "工作表名称" }
    ]
  }
}
<<ACTION_JSON_END>>
支持的表格 operations 仅限：set_cell、set_range、append_row、set_style、merge_cells、unmerge_cells、freeze_panes、sort_range、insert_rows、delete_rows、insert_columns、delete_columns、clear_range、create_sheet、rename_sheet、delete_sheet。行列索引均为 0-based。set_cell 可写入以 = 开头的公式字符串；set_style 支持 bold、italic、underline、wrap、textColor、fillColor、horizontalAlign、verticalAlign、numberFormat、fontSize、border；textColor 和 fillColor 可使用安全十六进制色值（如 #2563eb）或 default；删除工作表、删除行列、清空区域必须走这个预览确认流程，不要直接声称已经删除。

## 重要约束
- 文档创建和修改只能通过 ACTION_JSON 的 action 交给客户端执行，不要伪造 create_document 或 update_document 工具调用
- 表格修改只能通过 ACTION_JSON 的 spreadsheet_patch 交给客户端预览，不要伪造写入工具调用
- 输出 ACTION_JSON 时，完整内容只放在 action.content 中，不要在 reply 文本中重复输出内容
- "reply" 只能是一句状态提示，新建文档用 "正在为您创建文档「标题」~"，修改文档用 "已生成修改预览，请确认应用。"，修改表格用 "已生成表格修改预览，请确认应用。"
- 绝对禁止在 reply 中输出任何文章内容、改动说明、操作摘要、段落对比
- 禁止使用 "以下是"、"改动说明"、"具体改动如下"、"本次修改"、"新增了"、"删除了" 等引导词
- 完整内容只放在 "action.content" 中，reply 只做一句话通知
- docId 必须是 UUID（如 15e429e0-6a61-4711-bee8-8fa688cdec67），不能用文档标题

# 全局规则
- 效率：用户消息模糊或无明确写作需求（如 "你好"、"在吗"、表情、随机字符），简短回复，不要长篇大论
- 安全：不执行删除账户、数据库、历史记录、文档文件或整个表格文件等高风险删除。表格内部删除工作表/行/列/单元格必须通过 spreadsheet_patch 生成预览并等待用户确认。
- 保持专注：始终围绕写作辅助场景
- 用与用户相同的语言回复`;

export function buildDateTimeContext(): string {
  const now = new Date();
  const zh = now.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const iso = now.toISOString().slice(0, 10);
  return [
    `Current date and time: ${zh} ${time} (ISO 8601: ${iso})`,
    `- Day of week: ${now.toLocaleDateString("en-US", { weekday: "long" })}`,
    ``,
    `CRITICAL — Your training data is OUTDATED:`,
    `- Your knowledge cuts off well before the current date above.`,
    `- You do NOT know about events, news, weather, or facts from ${now.getFullYear()} unless you SEARCH.`,
    `- When users ask about "recent", "latest", "this year", "current", or any time-sensitive topic — you MUST call the search_web tool.`,
    `- If you answer from training data alone, you WILL give wrong/outdated information.`,
    `- Examples of queries that REQUIRE search_web: weather/typhoons, news, current events, "what happened recently", "latest X", "this year's Y".`,
  ].join("\n");
}

export type UserContext = {
  name?: string;
  currentDocTitle?: string;
  todayDocWords?: number;
  todayJournalWords?: number;
};

function buildUserContext(uc?: UserContext): string {
  if (!uc) return "";
  const lines: string[] = [];
  if (uc.name) {
    lines.push(`- 当前用户：${uc.name}`);
  }
  if (uc.currentDocTitle) {
    lines.push(`- 当前打开的文档：${uc.currentDocTitle}`);
  }
  if (uc.todayDocWords !== undefined && uc.todayDocWords > 0) {
    lines.push(`- 今日文档已写：${uc.todayDocWords} 字`);
  }
  if (uc.todayJournalWords !== undefined && uc.todayJournalWords > 0) {
    lines.push(`- 今日随记已写：${uc.todayJournalWords} 字`);
  }
  if (lines.length === 0) return "";
  return `# Current User Context\n${lines.join("\n")}\n- Use this information naturally in conversation — greet the user by name, acknowledge their progress, or reference their current document when relevant. Do NOT list these stats unless the user specifically asks.`;
}

export function buildSystemPrompt(
  personality: Personality,
  memoryContext: string,
  userContext?: UserContext,
): string {
  const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS.normal;
  const parts = [
    personalityPrompt,
    buildDateTimeContext(),
    buildUserContext(userContext),
    BASE_SYSTEM_PROMPT,
  ].filter(Boolean);
  let prompt = parts.join("\n\n");
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
        cleanReply = "已生成修改预览，请确认应用。";
      } else if (action?.type === "spreadsheet_patch") {
        cleanReply = "已生成表格修改预览，请确认应用。";
      } else if (action?.type === "create_document") {
        const title = typeof action.title === "string" && action.title.trim() ? action.title.trim() : "文档";
        cleanReply = `正在为您创建文档「${title}」~`;
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
        reply: cleanReply || "已生成修改预览，请确认应用。",
        action: docId && content ? { type: "update_document", docId, content } : null,
      };
    }

    if (action.type === "create_document") {
      const title = typeof action.title === "string" && action.title.trim() ? action.title.trim() : "无标题文档";
      const content = typeof action.content === "string" ? action.content.trim() : "";
      return {
        reply: cleanReply || `正在为您创建文档「${title}」~`,
        action: content ? { type: "create_document", title, content } : null,
      };
    }

    if (action.type === "spreadsheet_patch") {
      const spreadsheetId = typeof action.spreadsheetId === "string" ? action.spreadsheetId.trim() : "";
      const operations = Array.isArray(action.operations) ? action.operations.slice(0, 50) : [];
      return {
        reply: cleanReply || "已生成表格修改预览，请确认应用。",
        action: operations.length > 0 ? { type: "spreadsheet_patch", spreadsheetId, operations } : null,
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
      cleanReply = "已生成修改预览，请确认应用。";
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
    cleanReply = `正在为您创建文档「${title}」~`;
  }

  return {
    reply: cleanReply,
    action: docContent ? { type: "create_document", title, content: docContent } : null,
  };
}

export function resolveAssistantActionReply(reply: string): { reply: string; action: any } {
  return parseAction(reply);
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
  // Chinese high-risk delete without a polite prefix.
  /(?:删除|删掉|移除|清空|清除).*(?:账户|账号|数据库|历史记录|对话|全部数据|所有数据|文档|文件|整个表格|表格文件)/,
  // English: delete/remove/clear/erase + my/this/the/all/these/those + document/file/db/database/account/history/conversation/record/data
  /\b(?:delete|remove|clear|erase)\s+(?:my|this|the|all|these|those|selected)?\s*(?:document|file|db|database|account|history|conversation|record|data|spreadsheet|workbook)\b/i
];

const SPREADSHEET_STRUCTURE_DELETE_PATTERNS = [
  /(?:删除|删掉|移除|清空|清除).*(?:工作表|单元格|第?\s*\d+\s*[行列]|行|列)/,
  /\b(?:delete|remove|clear|erase)\b.*\b(?:worksheet|sheet|row|column|cell)\b/i,
];

const HIGH_RISK_DELETE_PATTERNS = [
  /(?:账户|账号|数据库|历史记录|对话|全部数据|所有数据|文档|文件|整个表格|表格文件)/,
  /\b(?:account|database|history|conversation|document|file|all\s+data|entire\s+spreadsheet|spreadsheet\s+file|workbook)\b/i,
];

export function detectDeleteCommand(content: string): boolean {
  const isDeleteIntent = DELETE_PATTERNS.some((pattern) => pattern.test(content));
  if (!isDeleteIntent) return false;
  const isSpreadsheetStructureDelete = SPREADSHEET_STRUCTURE_DELETE_PATTERNS.some((pattern) => pattern.test(content));
  const isHighRiskDelete = HIGH_RISK_DELETE_PATTERNS.some((pattern) => pattern.test(content));
  return !isSpreadsheetStructureDelete || isHighRiskDelete;
}

// --- Database operations ---
import prisma from "../lib/prisma";
import {
  defaultChatApiKey,
  defaultChatBaseUrl,
  defaultChatModel,
} from "../lib/aiProviderDefaults";

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
    apiKey: defaultChatApiKey(user?.apiKey),
    apiBaseUrl: defaultChatBaseUrl(user?.apiBaseUrl),
    aiModel: defaultChatModel(user?.aiModel),
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

export async function saveConversation(userId: string, messages: any[], personality: string, conversationId?: string | null) {
  const targetId = typeof conversationId === "string" ? conversationId.trim() : "";
  if (targetId) {
    const existing = await prisma.conversation.findFirst({
      where: { id: targetId, userId },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("Conversation not found");
    }
    return prisma.conversation.update({
      where: { id: existing.id },
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
