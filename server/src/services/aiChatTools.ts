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

export function buildChatTools(): ChatToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "search_web",
        description: "Search the web for current information. Use this when the user asks about recent events, facts, or information beyond your knowledge cutoff.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_user_stats",
        description: "Get the current user's workspace statistics: total documents, journal entries, groups, brain knowledge items, and word counts. Use this when the user asks questions like 'how many documents do I have?', 'how many journals?', 'my writing stats', etc.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "list_recent_documents",
        description: "List the user's most recently updated documents. Use this when the user asks 'what documents do I have?', 'list my docs', 'show my recent documents', etc.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of documents to return, default 5, max 10" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_today_writing",
        description: "Get today's writing activity: how many words written today, how many documents edited, how many journal entries. Use when the user asks 'how much did I write today?', 'today's progress', etc.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
  ];
}
