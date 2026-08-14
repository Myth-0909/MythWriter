import type { Document, DocumentVersion, Spreadsheet, SpreadsheetWorkbook, WorkRecord, WorkRecordPeriod } from "@/types";
import { API_BASE } from "@/lib/apiBase";
import { translate } from "@/components/I18nProvider";
import type { FontFamilyKey } from "@/lib/fontCatalog";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  fontFamilyKey: FontFamilyKey;
}

export interface ApiKeyHistory {
  id: string;
  masked: string;
  baseUrl: string;
  model: string;
  updatedAt: string;
}

export interface WritingReviewSuggestion {
  id: string;
  type: "structure" | "tone" | "readability" | "completeness" | "density" | string;
  title: string;
  detail: string;
  actionPrompt: string;
  severity: "high" | "medium" | "low";
}

export interface RagKnowledgeResult {
  id: string;
  knowledgeId: string;
  title: string;
  description: string;
  category?: string;
  score: number;
}

export interface RagDocumentResult {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  score: number;
}

export interface RagSearchResponse<T> {
  results: T[];
  degraded: boolean;
  error?: string;
}

export type AgentStage = "analyze" | "research" | "plan" | "draft" | "review" | "publish";

export interface AgentSource {
  type: "brain" | "document" | "journal" | "web";
  id: string;
  title: string;
  excerpt: string;
  score?: number;
  degraded?: boolean;
}

export interface AgentOutlineItem {
  heading: string;
  brief: string;
}

export interface AgentReview {
  score: number;
  suggestions: { detail: string; severity: "high" | "medium" | "low" }[];
}

export interface AgentProgressEvent {
  stage: AgentStage;
  message: string;
  analysis?: AgentAnalysis;
  sources?: AgentSource[];
  outline?: AgentOutlineItem[];
  sectionIndex?: number;
  totalSections?: number;
  content?: string;
  review?: AgentReview;
  docId?: string;
  title?: string;
}

export interface AgentAnalysis {
  genre: string;
  tone: string;
  themes: string[];
  estimatedWords: number;
}

export interface AgentDoneEvent {
  docId: string | null;
  title: string;
  content: string;
  analysis: AgentAnalysis;
  outline: AgentOutlineItem[];
  review: AgentReview;
  sources: AgentSource[];
}

export interface AgentWriteRequest {
  goal: string;
  stylePrompt?: string;
  targetWords?: number;
  includeBrain?: boolean;
  includeDocuments?: boolean;
  includeJournal?: boolean;
  includeWeb?: boolean;
  referenceDocIds?: string[];
  referenceBrainIds?: string[];
  referenceJournalIds?: string[];
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Language": localStorage.getItem("lang") === "en" ? "en" : "zh",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (timedOut) {
      throw new ApiError(translate("network.timeout"), 0, "REQUEST_TIMEOUT");
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new ApiError(translate("network.offline"), 0, "NETWORK_OFFLINE");
    }
    throw new ApiError(translate("network.requestFailed"), 0, "NETWORK_ERROR");
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({})) as { error?: string; code?: string };
    if ((res.status === 401 || res.status === 403) && token && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    throw new ApiError(error.error || translate("network.requestFailed"), res.status, error.code);
  }

  return res.json();
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export async function streamAgentWrite(
  data: AgentWriteRequest,
  handlers: {
    onProgress: (event: AgentProgressEvent) => void;
    onDone: (event: AgentDoneEvent) => void;
    onError?: (message: string) => void;
  },
  signal?: AbortSignal
): Promise<AgentDoneEvent | null> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/ai/agent/write`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
    signal,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: translate("network.requestFailed") }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error(translate("ai.streamIncomplete"));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent: AgentDoneEvent | null = null;

  const handleBlock = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    let payload: any;
    try {
      payload = JSON.parse(parsed.data);
    } catch {
      throw new Error(translate("ai.streamInvalid"));
    }
    if (parsed.event === "progress") {
      handlers.onProgress(payload);
    } else if (parsed.event === "done") {
      doneEvent = payload;
      handlers.onDone(payload);
    } else if (parsed.event === "error") {
      const message = String(payload?.error || translate("ai.streamFailed"));
      handlers.onError?.(message);
      throw new Error(message);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      if (block.trim()) handleBlock(block);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleBlock(buffer);
  if (!doneEvent && !signal?.aborted) throw new Error(translate("ai.streamIncomplete"));
  return doneEvent;
}

// Auth API
export const api = {
  register: (data: { name: string; email: string; password: string }) =>
    request<{ token: string; user: ApiUser }>(
      "/auth/register", { method: "POST", body: JSON.stringify(data) }
    ),

  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: ApiUser }>(
      "/auth/login", { method: "POST", body: JSON.stringify(data) }
    ),

  getProfile: () =>
    request<{ user: ApiUser & { createdAt: string; _count: { documents: number } } }>(
      "/users/me"
    ),

  updateProfile: (data: { name?: string; avatar?: string; password?: string; newPassword?: string; lang?: string; timeZone?: string; fontFamilyKey?: FontFamilyKey }) =>
    request<{ user: ApiUser & { createdAt: string } }>(
      "/users/me", { method: "PUT", body: JSON.stringify(data) }
    ),

  listDocuments: () =>
    request<{ documents: Document[] }>("/documents"),

  listFavorites: () =>
    request<{ documents: Document[] }>("/documents/favorites"),

  listTrash: () =>
    request<{ documents: Document[] }>("/documents/trash"),

  getDocument: (id: string) =>
    request<{ document: Document }>(`/documents/${id}`),

  createDocument: (data?: { title?: string; content?: string; preview?: string; category?: string; groupId?: string | null; trackWriting?: boolean }) =>
    request<{ document: Document }>("/documents", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  updateDocument: (id: string, data: Partial<Pick<Document, "title" | "content" | "preview" | "category" | "groupId">>) =>
    request<{ document: Document }>(`/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  listDocumentVersions: (id: string) =>
    request<{ versions: DocumentVersion[] }>(`/documents/${id}/versions`),

  createDocumentVersion: (id: string, data?: { source?: string }) =>
    request<{ version: DocumentVersion }>(`/documents/${id}/versions`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  restoreDocumentVersion: (id: string, versionId: string) =>
    request<{ document: Document }>(`/documents/${id}/versions/${versionId}/restore`, {
      method: "PATCH",
    }),

  toggleFavorite: (id: string) =>
    request<{ document: Document }>(`/documents/${id}/favorite`, { method: "PATCH" }),

  moveToTrash: (id: string) =>
    request<{ document: Document }>(`/documents/${id}/trash`, { method: "PATCH" }),

  restoreDocument: (id: string) =>
    request<{ document: Document }>(`/documents/${id}/restore`, { method: "PATCH" }),

  deleteDocument: (id: string) =>
    request<{ success: boolean }>(`/documents/${id}`, { method: "DELETE" }),

  emptyTrash: () =>
    request<{ success: boolean }>("/documents/trash/empty", { method: "DELETE" }),

  listSpreadsheets: () =>
    request<{ spreadsheets: Spreadsheet[] }>("/spreadsheets"),

  getSpreadsheet: (id: string) =>
    request<{ spreadsheet: Spreadsheet }>(`/spreadsheets/${id}`),

  createSpreadsheet: (data?: { title?: string; data?: SpreadsheetWorkbook; groupId?: string | null }) =>
    request<{ spreadsheet: Spreadsheet }>("/spreadsheets", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  updateSpreadsheet: (id: string, data: { title?: string; data?: SpreadsheetWorkbook; groupId?: string | null }) =>
    request<{ spreadsheet: Spreadsheet }>(`/spreadsheets/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteSpreadsheet: (id: string) =>
    request<{ success: boolean }>(`/spreadsheets/${id}`, { method: "DELETE" }),

  forgotPassword: (data: { email: string }) =>
    request<{ message: string; devCode?: string; expiresIn: string }>(
      "/auth/forgot-password", { method: "POST", body: JSON.stringify(data) }
    ),

  resetPassword: (data: { email: string; code: string; newPassword: string }) =>
    request<{ message: string }>(
      "/auth/reset-password", { method: "POST", body: JSON.stringify(data) }
    ),

  checkEmail: (email: string) =>
    request<{ exists: boolean }>(
      "/auth/check-email", { method: "POST", body: JSON.stringify({ email }) }
    ),

  uploadAvatar: (image: string) =>
    request<{ user: { id: string; name: string; email: string; avatar: string | null }; avatarUrl: string }>(
      "/users/avatar", { method: "POST", body: JSON.stringify({ image }) }
    ),

  getWeeklyStats: () =>
    request<{
      stats: {
        dayIndex: number;
        date: string;
        words: number;
        documentWords: number;
        journalWords: number;
      }[];
      week?: { start: string; end: string };
    }>("/stats/weekly"),

  listWorkRecords: (params?: { period?: WorkRecordPeriod; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.period) query.set("period", params.period);
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ records: WorkRecord[] }>(`/work-records${suffix}`);
  },

  getCurrentWorkRecord: (period: WorkRecordPeriod, targetDate: string) =>
    request<{ record: WorkRecord | null }>(`/work-records/current?period=${period}&targetDate=${encodeURIComponent(targetDate)}`),

  saveWorkRecord: (data: { period: WorkRecordPeriod; targetDate: string; title: string; content: string }) =>
    request<{ record: WorkRecord }>("/work-records", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteWorkRecord: (id: string) =>
    request<{ success: boolean }>(`/work-records/${id}`, { method: "DELETE" }),

  generateWorkRecord: (data: { period: "weekly" | "monthly"; targetDate: string }) =>
    request<{ record: WorkRecord; sourceCount: number }>("/work-records/ai/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  polishWorkRecord: (data: { period: WorkRecordPeriod; title: string; content: string }) =>
    request<{ title: string; content: string }>("/work-records/ai/polish", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  aiGreeting: (data: { userName: string; personality: string }) =>
    request<{ greeting: string }>(
      "/ai/greeting", { method: "POST", body: JSON.stringify(data) }
    ),

  aiChat: (data: {
    messages: { role: string; content: string }[];
    personality: string;
    memoryContext: string;
    references?: { type: "document" | "brain" | "spreadsheet"; id: string; title: string }[];
  }) =>
    request<{ reply: string; action: { type: string; title?: string; docId?: string; spreadsheetId?: string; content?: string; operations?: unknown[] } | null }>(
      "/ai/chat", { method: "POST", body: JSON.stringify(data) }
    ),

  writingReview: (data: { title: string; content: string }) =>
    request<{ score: number; suggestions: WritingReviewSuggestion[] }>(
      "/ai/writing-review", { method: "POST", body: JSON.stringify(data) }
    ),

  getConversations: () =>
    request<{ conversations: { id: string; messages: any[]; personality: string; createdAt: string; updatedAt?: string }[] }>(
      "/ai/conversations"
    ),

  saveConversation: (data: { messages: { role: string; content: string }[]; personality: string; conversationId?: string }) =>
    request<{ conversation: { id: string } }>(
      "/ai/conversations", { method: "POST", body: JSON.stringify(data) }
    ),

  deleteConversations: () =>
    request<{ success: boolean }>(
      "/ai/conversations", { method: "DELETE" }
    ),

  deleteConversation: (id: string) =>
    request<{ success: boolean }>(
      `/ai/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }
    ),

  sendFeedback: (data: { messageContent: string; feedbackType: string; rating?: number; reason?: string }) =>
    request<{ feedback: { id: string } }>(
      "/ai/feedback", { method: "POST", body: JSON.stringify(data) }
    ),

  logActivity: (data: { action: string; detail?: string }) =>
    request<{ success: boolean }>(
      "/ai/log", { method: "POST", body: JSON.stringify(data) }
    ),

  getApiKey: () =>
    request<{ hasKey: boolean; masked: string; baseUrl: string; model: string; histories: ApiKeyHistory[] }>(
      "/users/me/apikey"
    ),

  saveApiKey: (data: { apiKey?: string; baseUrl: string; model: string }) =>
    request<{ success: boolean }>(
      "/users/me/apikey", { method: "PUT", body: JSON.stringify(data) }
    ),

  testApiKey: (data: { apiKey?: string; baseUrl: string; model: string; prompt?: string }) =>
    request<{ success: boolean; reply: string; model: string; prompt: string }>(
      "/users/me/apikey/test", { method: "POST", body: JSON.stringify(data) }
    ),

  fetchModels: (data: { baseUrl: string; apiKey?: string }) =>
    request<{ models: string[] }>(
      "/users/me/models", { method: "POST", body: JSON.stringify(data) }
    ),

  getEmbeddingConfig: () =>
    request<{ hasKey: boolean; masked: string; baseUrl: string; model: string }>(
      "/users/me/embedding"
    ),

  saveEmbeddingConfig: (data: { apiKey?: string; baseUrl: string; model: string }) =>
    request<{ success: boolean }>(
      "/users/me/embedding", { method: "PUT", body: JSON.stringify(data) }
    ),

  listApiKeyHistories: () =>
    request<{ histories: ApiKeyHistory[] }>("/users/me/apikey/history"),

  applyApiKeyHistory: (id: string) =>
    request<{ hasKey: boolean; masked: string; baseUrl: string; model: string; histories: ApiKeyHistory[] }>(
      `/users/me/apikey/history/${id}/apply`, { method: "POST" }
    ),

  deleteApiKeyHistory: (id: string) =>
    request<{ success: boolean; histories: ApiKeyHistory[] }>(
      `/users/me/apikey/history/${id}`, { method: "DELETE" }
    ),

  verifyPassword: (password: string) =>
    request<{ verified: boolean }>(
      "/auth/verify-password", { method: "POST", body: JSON.stringify({ password }) }
    ),

  logout: () =>
    request<{ success: boolean; message: string }>(
      "/session/logout", { method: "POST" }
    ),

  // Document Groups API
  listGroups: () =>
    request<{ groups: any[] }>("/groups"),

  createGroup: (data: { name: string }) =>
    request<{ group: any }>("/groups", { method: "POST", body: JSON.stringify(data) }),

  renameGroup: (id: string, data: { name: string }) =>
    request<{ group: any }>(`/groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteGroup: (id: string) =>
    request<{ success: boolean }>(`/groups/${id}`, { method: "DELETE" }),

  addDocsToGroup: (groupId: string, documentIds: string[]) =>
    request<{ success: boolean }>(`/groups/${groupId}/add`, {
      method: "POST",
      body: JSON.stringify({ documentIds }),
    }),

  removeDocsFromGroup: (groupId: string, documentIds: string[]) =>
    request<{ success: boolean }>(`/groups/${groupId}/remove`, {
      method: "POST",
      body: JSON.stringify({ documentIds }),
    }),

  // AI Brain Knowledge API
  listBrainKnowledges: () =>
    request<{ knowledges: any[] }>("/ai/knowledge"),

  createBrainKnowledge: (data: { title: string; description: string; category: string; categoryId?: string | null }) =>
    request<{ knowledge: any }>("/ai/knowledge", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateBrainKnowledge: (id: string, data: { title?: string; description?: string; category?: string; categoryId?: string | null }) =>
    request<{ knowledge: any }>(`/ai/knowledge/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteBrainKnowledge: (id: string) =>
    request<{ success: boolean }>(`/ai/knowledge/${id}`, { method: "DELETE" }),

  ragStatus: () =>
    request<{ available: boolean; error?: string }>("/rag/status"),

  searchRagKnowledge: (data: { query: string; topK?: number }) =>
    request<RagSearchResponse<RagKnowledgeResult>>("/rag/search-knowledge", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  searchRagDocuments: (data: { query: string; topK?: number }) =>
    request<RagSearchResponse<RagDocumentResult>>("/rag/search-documents", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  reindexBrainKnowledge: (id: string) =>
    request<{ indexed: boolean; error?: string }>(`/rag/reindex-knowledge/${id}`, { method: "POST" }),

  reindexAllBrainKnowledge: () =>
    request<{ indexed: number; failed: number; total: number }>("/rag/reindex-all", { method: "POST" }),

  // AI Brain Categories API
  listBrainCategories: () =>
    request<{ categories: any[] }>("/ai/categories"),

  createBrainCategory: (data: { name: string; color?: string }) =>
    request<{ category: any }>("/ai/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateBrainCategory: (id: string, data: { name?: string; color?: string; sortOrder?: number }) =>
    request<{ category: any }>(`/ai/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  reorderBrainCategories: (items: { id: string; sortOrder: number }[]) =>
    request<{ success: boolean }>("/ai/categories/reorder", {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),

  deleteBrainCategory: (id: string) =>
    request<{ success: boolean }>(`/ai/categories/${id}`, { method: "DELETE" }),
};
