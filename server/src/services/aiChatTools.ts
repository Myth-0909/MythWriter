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

export function buildChatTools(): ChatToolDefinition[] {
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
