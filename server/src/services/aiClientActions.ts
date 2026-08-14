import { t } from "../lib/i18n";
import type { AssistantToolCall } from "./aiToolConversation";

export const CLIENT_ACTION_TOOL_NAMES = new Set([
  "create_document",
  "update_document",
  "patch_document",
  "spreadsheet_patch",
]);

export function isClientActionTool(name: string): boolean {
  return CLIENT_ACTION_TOOL_NAMES.has(name);
}

export type ClientChatAction =
  | { type: "create_document"; title: string; content: string }
  | { type: "update_document"; docId: string; content: string }
  | {
      type: "patch_document";
      docId: string;
      operations: Array<{ type: "replace_once" | "replace_all"; find: string; replace: string }>;
    }
  | { type: "spreadsheet_patch"; spreadsheetId: string; operations: unknown[] };

function parseArgs(raw: string | undefined): Record<string, any> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function defaultReply(action: ClientChatAction | null, lang: string): string {
  if (!action) return "";
  if (action.type === "create_document") {
    return t(lang, `正在为您创建文档「${action.title}」~`, `Creating document "${action.title}"...`);
  }
  if (action.type === "update_document") {
    return t(lang, "已生成修改预览，请确认应用。", "Update preview is ready. Please confirm to apply.");
  }
  if (action.type === "patch_document") {
    return t(lang, "已生成局部修改预览，请确认应用。", "Patch preview is ready. Please confirm to apply.");
  }
  return t(lang, "已生成表格修改预览，请确认应用。", "Spreadsheet patch preview is ready. Please confirm to apply.");
}

export function parseClientActionFromToolCalls(
  toolCalls: Array<Pick<AssistantToolCall, "name" | "arguments">>,
  lang = "zh"
): { action: ClientChatAction | null; reply: string } {
  for (const toolCall of toolCalls) {
    const name = String(toolCall.name || "").trim();
    if (!isClientActionTool(name)) continue;
    const args = parseArgs(toolCall.arguments);

    if (name === "create_document") {
      const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : t(lang, "无标题文档", "Untitled");
      const content = typeof args.content === "string" ? args.content.trim() : "";
      if (!content) continue;
      const action: ClientChatAction = { type: "create_document", title, content };
      return { action, reply: defaultReply(action, lang) };
    }

    if (name === "update_document") {
      const docId = typeof args.docId === "string" ? args.docId.trim() : "";
      const content = typeof args.content === "string" ? args.content.trim() : "";
      if (!docId || !content) continue;
      const action: ClientChatAction = { type: "update_document", docId, content };
      return { action, reply: defaultReply(action, lang) };
    }

    if (name === "patch_document") {
      const docId = typeof args.docId === "string" ? args.docId.trim() : "";
      const operations = Array.isArray(args.operations)
        ? args.operations
          .map((op: any) => ({
            type: op?.type === "replace_all" ? "replace_all" as const : "replace_once" as const,
            find: String(op?.find || ""),
            replace: String(op?.replace ?? ""),
          }))
          .filter((op: { find: string }) => op.find.trim().length > 0)
          .slice(0, 40)
        : [];
      if (!docId || operations.length === 0) continue;
      const action: ClientChatAction = { type: "patch_document", docId, operations };
      return { action, reply: defaultReply(action, lang) };
    }

    if (name === "spreadsheet_patch") {
      const spreadsheetId = typeof args.spreadsheetId === "string" ? args.spreadsheetId.trim() : "";
      const operations = Array.isArray(args.operations) ? args.operations.slice(0, 50) : [];
      if (operations.length === 0) continue;
      const action: ClientChatAction = { type: "spreadsheet_patch", spreadsheetId, operations };
      return { action, reply: defaultReply(action, lang) };
    }
  }

  return { action: null, reply: "" };
}

type ClientActionToolDefinition = {
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

export function buildClientActionTools(): ClientActionToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "create_document",
        description:
          "Propose creating a new document (article, report, brief, news digest, etc.). Use whenever the user asks to generate/write/draft/create a document — including compiling web search results into a new document. The client creates it after the user confirms.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Document title" },
            content: { type: "string", description: "Full Markdown document content" },
          },
          required: ["content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "patch_document",
        description: "Propose local text patches for an existing document. Prefer this over rewriting the full document when changing a few sentences/paragraphs.",
        parameters: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document UUID from [doc:UUID]" },
            operations: {
              type: "array",
              description: "Ordered find/replace operations against plain text (HTML stripped)",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["replace_once", "replace_all"] },
                  find: { type: "string" },
                  replace: { type: "string" },
                },
                required: ["type", "find", "replace"],
              },
            },
          },
          required: ["docId", "operations"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_document",
        description: "Propose a full-document rewrite when local patches are insufficient. Prefer patch_document for small edits.",
        parameters: {
          type: "object",
          properties: {
            docId: { type: "string", description: "Document UUID from [doc:UUID]" },
            content: { type: "string", description: "Full rewritten Markdown content" },
          },
          required: ["docId", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "spreadsheet_patch",
        description: "Propose spreadsheet mutations for client preview/confirmation.",
        parameters: {
          type: "object",
          properties: {
            spreadsheetId: { type: "string", description: "Spreadsheet UUID from [sheet:UUID]" },
            operations: { type: "array", items: { type: "object" } },
          },
          required: ["operations"],
        },
      },
    },
  ];
}
