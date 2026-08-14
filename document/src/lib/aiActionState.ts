export type AssistantAction =
  | { type: "create_document"; title?: string; content?: string }
  | {
      type: "update_document";
      docId?: string;
      content?: string;
    }
  | {
      type: "patch_document";
      docId?: string;
      operations?: Array<{ type: "replace_once" | "replace_all"; find: string; replace: string }>;
    }
  | {
      type: "spreadsheet_patch";
      spreadsheetId?: string;
      operations?: unknown[];
    }
  | null
  | undefined;

type ActionLabels = {
  createPending: string;
  createSuccess: string;
  createFailed: string;
  updatePreview: string;
  patchPreview?: string;
  spreadsheetPreview?: string;
  genericFailure: string;
  fallbackTitle?: string;
};

type ToolCallEvidence = {
  result?: string;
  summary?: string;
  content?: string;
};

function actionTitle(action: AssistantAction, fallbackTitle: string): string {
  return action && "title" in action && typeof action.title === "string" && action.title.trim()
    ? action.title.trim()
    : fallbackTitle;
}

function fillTitle(template: string, title: string): string {
  return template.split("{title}").join(title);
}

export function resolveActionDisplayContent(
  action: AssistantAction,
  fallbackReply: string,
  labels: ActionLabels
): string {
  if (action?.type === "create_document") {
    return fillTitle(labels.createPending, actionTitle(action, labels.fallbackTitle || ""));
  }
  if (action?.type === "patch_document") {
    return labels.patchPreview || labels.updatePreview;
  }
  if (action?.type === "spreadsheet_patch") {
    return labels.spreadsheetPreview || labels.updatePreview;
  }
  if (action?.type === "update_document") {
    return labels.updatePreview;
  }
  return fallbackReply;
}

export function resolveActionSuccessContent(action: AssistantAction, labels: ActionLabels): string {
  if (action?.type === "create_document") {
    return fillTitle(labels.createSuccess, actionTitle(action, labels.fallbackTitle || ""));
  }
  if (action?.type === "patch_document") {
    return labels.patchPreview || labels.updatePreview;
  }
  return labels.updatePreview;
}

export function resolveActionFailureContent(action: AssistantAction, labels: ActionLabels): string {
  if (action?.type === "create_document") {
    return labels.createFailed;
  }
  return labels.genericFailure;
}

export function buildToolMemoryContent(toolCall: ToolCallEvidence): string {
  const content = String(toolCall.content || "").trim();
  if (content) return content;
  const summary = String(toolCall.summary || "").trim();
  const result = String(toolCall.result || "").trim();
  return [summary, result].filter(Boolean).join("\n") || result;
}

export function isDocumentActionBaselineCurrent(
  current: { title: string; content: string } | null | undefined,
  baseline: { title: string; content: string }
): boolean {
  return !!current && current.title === baseline.title && current.content === baseline.content;
}

export function isSpreadsheetActionBaselineCurrent(
  current: { title: string; data: unknown } | null | undefined,
  baseline: { title: string; data: unknown }
): boolean {
  return !!current
    && current.title === baseline.title
    && JSON.stringify(current.data) === JSON.stringify(baseline.data);
}
