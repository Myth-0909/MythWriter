import { buildClientActionTools } from "./aiClientActions";

export type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
};

export type ChatToolIntent = "chat" | "workspace" | "edit" | "web" | "full";

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = []
): ChatToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

const WRITE_EDIT_PATTERN =
  /改|修改|润色|重写|扩写|缩写|续写|删除|替换|插入|补充|总结|概括|解释|解读|什么意思|讲了什么|讲的是|校对|优化|整理|完善|更新|编辑|修订|patch|rewrite|edit|revise|polish|expand|summarize|continue|fix|update|insert|append|replace|delete|improve|outline|explain|mean|表格|单元格|工作表|spreadsheet|sheet|cell|row|column|当前(文档|文章|内容|表格)|这篇|这份|本文|全文|这段|这一段|第二段|开头|结尾|创建文档|新建文档|新建一篇|生成文档|生成一份|生成一篇|写一份|写一篇|做一份|出一份|起草|撰文|整理成文档|写成文档|保存为文档|存成文档|帮我写|请写|给我写|write (me )?(a |an )?(new )?(doc|document|article|post|report)|draft (a |an )?(doc|document|article|post|report)|create (a |an )?(new )?(doc|document|article)/;

const WORKSPACE_PATTERN =
  /今天|今日|这周|本周|最近|收藏|回收站|废纸篓|脑库|设定|分组|版本|写了多少|多少字|几篇|统计|文档有哪些|有哪些文档|列表|列出|today|favorite|trash|brain|version|how many|stats|workspace/;

const WEB_PATTERN =
  /天气|台风|新闻|股价|比赛|赛事|路况|地震|疫情|最新|最近发生|today'?s weather|weather|typhoon|stock|news|score/;

/**
 * Prefer edit over web/workspace when the user asks to produce or change a document.
 * Example: "生成一份…新闻" must expose create_document (and still keep search_web via edit tools),
 * not the web-only tool set.
 */
export function resolveChatToolIntent(text: string): ChatToolIntent {
  const raw = String(text || "").trim();
  if (!raw) return "chat";
  if (WRITE_EDIT_PATTERN.test(raw)) return "edit";
  if (WEB_PATTERN.test(raw)) return "web";
  if (WORKSPACE_PATTERN.test(raw)) return "workspace";
  return "chat";
}

function buildReadonlyTools(): ChatToolDefinition[] {
  return [
    tool("search_web", "Search the web for current information. Use only when the user asks about recent external facts beyond the local workspace.", {
      query: { type: "string", description: "The search query" },
    }, ["query"]),
    tool("get_user_stats", "Get total workspace counts: active documents, journal/work records, groups, brain knowledge items, and aggregate journal words. Do not use for today's counts."),
    tool("list_documents", "List active documents with title, category, favorite state, dates, and word counts. Use for broad document inventory questions.", {
      limit: { type: "number", description: "Number of documents, default 10, max 20" },
    }),
    tool("get_document_summary", "Get a compact summary of one document by id or title, including dates, category, favorite state, word count, and excerpt.", {
      id: { type: "string", description: "Document id when known" },
      title: { type: "string", description: "Document title or partial title when id is unknown" },
    }),
    tool("search_documents", "Keyword-search active documents by title, preview, or content excerpt. Use for 'find documents about X' questions.", {
      query: { type: "string", description: "Keyword query" },
      limit: { type: "number", description: "Number of matches, default 5, max 10" },
    }, ["query"]),
    tool("list_spreadsheets", "List active built-in spreadsheets with title, sheet count, updated date, and compact preview. Use for spreadsheet inventory questions.", {
      limit: { type: "number", description: "Number of spreadsheets, default 10, max 20" },
    }),
    tool("get_spreadsheet_summary", "Get a compact summary of one built-in spreadsheet by id or title, including sheet names, used cells, and sample rows.", {
      id: { type: "string", description: "Spreadsheet id when known" },
      title: { type: "string", description: "Spreadsheet title or partial title when id is unknown" },
    }),
    tool("search_spreadsheets", "Keyword-search active built-in spreadsheets by title, preview, or visible cell values. Use for 'find spreadsheet rows/cells about X' questions.", {
      query: { type: "string", description: "Keyword query" },
      limit: { type: "number", description: "Number of matches, default 5, max 10" },
    }, ["query"]),
    tool("list_recent_documents", "List the user's most recently updated active documents. Use for recent edits or recent writing questions.", {
      limit: { type: "number", description: "Number of documents, default 5, max 10" },
    }),
    tool("list_favorite_documents", "List favorite active documents. Use when the user asks about starred, collected, or favorite articles/documents.", {
      limit: { type: "number", description: "Number of documents, default 10, max 20" },
    }),
    tool("list_trashed_documents", "List documents currently in trash/recycle bin. Read-only; does not restore or delete.", {
      limit: { type: "number", description: "Number of documents, default 10, max 20" },
    }),
    tool("get_today_writing", "Get today's writing activity: documents created today, documents updated today, document words, journal entries, and confirmed words."),
    tool("get_writing_range_stats", "Get writing activity for a recent date range. Use for week/month/range progress questions.", {
      days: { type: "number", description: "Recent days to include, default 7, max 31" },
    }),
    tool("get_weekly_writing_stats", "Get the existing 7-day writing trend used by the dashboard."),
    tool("list_work_records", "List daily, weekly, or monthly work records/journals. Use for journal, 随记, 日报, 周报, 月报 questions.", {
      period: { type: "string", enum: ["daily", "weekly", "monthly"], description: "Optional record period" },
      limit: { type: "number", description: "Number of records, default 10, max 20" },
    }),
    tool("get_current_work_record", "Get one work record by period and target date.", {
      period: { type: "string", enum: ["daily", "weekly", "monthly"] },
      targetDate: { type: "string", description: "Date in YYYY-MM-DD format" },
    }, ["period", "targetDate"]),
    tool("list_document_groups", "List document groups and the active documents in each group."),
    tool("list_document_versions", "List version snapshots for a document by id or title.", {
      id: { type: "string", description: "Document id when known" },
      title: { type: "string", description: "Document title or partial title when id is unknown" },
      limit: { type: "number", description: "Number of versions, default 10, max 20" },
    }),
    tool("list_brain_knowledge", "List brain knowledge/settings cards, optionally filtered by category.", {
      category: { type: "string", description: "Optional category name" },
      limit: { type: "number", description: "Number of entries, default 10, max 20" },
    }),
    tool("search_brain_knowledge", "Keyword-search brain knowledge/settings cards by title, category, or description.", {
      query: { type: "string", description: "Keyword query" },
      limit: { type: "number", description: "Number of matches, default 5, max 10" },
    }, ["query"]),
    tool("list_brain_categories", "List brain knowledge categories and counts."),
    tool("search_document_semantic", "Semantic-search document chunks with RAG. Return degraded status if semantic search is unavailable.", {
      query: { type: "string", description: "Semantic query" },
      topK: { type: "number", description: "Number of matches, default 5, max 10" },
    }, ["query"]),
    tool("search_knowledge_semantic", "Semantic-search brain knowledge with RAG. Return degraded status if semantic search is unavailable.", {
      query: { type: "string", description: "Semantic query" },
      topK: { type: "number", description: "Number of matches, default 5, max 10" },
    }, ["query"]),
    tool("get_rag_status", "Check whether semantic retrieval/RAG is currently available."),
  ];
}

const CHAT_TOOL_NAMES = new Set([
  "search_web",
  "get_user_stats",
  "get_today_writing",
  "list_recent_documents",
  "get_rag_status",
]);

const WORKSPACE_TOOL_NAMES = new Set([
  ...CHAT_TOOL_NAMES,
  "list_documents",
  "get_document_summary",
  "search_documents",
  "list_spreadsheets",
  "get_spreadsheet_summary",
  "search_spreadsheets",
  "list_favorite_documents",
  "list_trashed_documents",
  "get_writing_range_stats",
  "get_weekly_writing_stats",
  "list_work_records",
  "get_current_work_record",
  "list_document_groups",
  "list_document_versions",
  "list_brain_knowledge",
  "search_brain_knowledge",
  "list_brain_categories",
  "search_document_semantic",
  "search_knowledge_semantic",
]);

export function buildChatTools(intent: ChatToolIntent = "full"): ChatToolDefinition[] {
  const readonlyTools = buildReadonlyTools();
  const clientTools = buildClientActionTools();

  if (intent === "full" || intent === "edit") {
    return [...clientTools, ...readonlyTools];
  }
  if (intent === "web") {
    return readonlyTools.filter((item) => item.function.name === "search_web" || CHAT_TOOL_NAMES.has(item.function.name));
  }
  if (intent === "workspace") {
    return readonlyTools.filter((item) => WORKSPACE_TOOL_NAMES.has(item.function.name));
  }
  // chat
  return readonlyTools.filter((item) => CHAT_TOOL_NAMES.has(item.function.name));
}

export function resolveChatRequestTools(params: {
  purpose?: string;
  userText: string;
}): ChatToolDefinition[] {
  if (params.purpose === "selection_edit") {
    return [];
  }
  return buildChatTools(resolveChatToolIntent(params.userText));
}
