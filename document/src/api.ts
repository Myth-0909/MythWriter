import type { Document, DocumentVersion } from "@/types";

const API_BASE = "http://localhost:3000/api";

export interface ApiKeyHistory {
  id: string;
  masked: string;
  baseUrl: string;
  model: string;
  updatedAt: string;
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "网络错误" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth API
export const api = {
  register: (data: { name: string; email: string; password: string }) =>
    request<{ token: string; user: { id: string; name: string; email: string; avatar: string | null } }>(
      "/auth/register", { method: "POST", body: JSON.stringify(data) }
    ),

  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: { id: string; name: string; email: string; avatar: string | null } }>(
      "/auth/login", { method: "POST", body: JSON.stringify(data) }
    ),

  getProfile: () =>
    request<{ user: { id: string; name: string; email: string; avatar: string | null; createdAt: string; _count: { documents: number } } }>(
      "/users/me"
    ),

  updateProfile: (data: { name?: string; avatar?: string; password?: string; newPassword?: string; lang?: string }) =>
    request<{ user: { id: string; name: string; email: string; avatar: string | null; createdAt: string } }>(
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

  createDocument: (data?: { title?: string; content?: string; preview?: string; category?: string; groupId?: string | null }) =>
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

  forgotPassword: (data: { email: string }) =>
    request<{ message: string; code: string; expiresIn: string }>(
      "/auth/forgot-password", { method: "POST", body: JSON.stringify(data) }
    ),

  resetPassword: (data: { email: string; code: string; newPassword: string }) =>
    request<{ message: string }>(
      "/auth/reset-password", { method: "POST", body: JSON.stringify(data) }
    ),

  uploadAvatar: (image: string) =>
    request<{ user: { id: string; name: string; email: string; avatar: string | null }; avatarUrl: string }>(
      "/users/avatar", { method: "POST", body: JSON.stringify({ image }) }
    ),

  getWeeklyStats: () =>
    request<{ stats: { dayIndex: number; date: string; words: number }[] }>("/stats/weekly"),

  aiGreeting: (data: { userName: string; personality: string }) =>
    request<{ greeting: string }>(
      "/ai/greeting", { method: "POST", body: JSON.stringify(data) }
    ),

  aiChat: (data: {
    messages: { role: string; content: string }[];
    personality: string;
    memoryContext: string;
    references?: { type: "document"; id: string; title: string }[];
  }) =>
    request<{ reply: string; action: { type: string; title?: string; docId?: string; content?: string } | null }>(
      "/ai/chat", { method: "POST", body: JSON.stringify(data) }
    ),

  getConversations: () =>
    request<{ conversations: { id: string; messages: any[]; personality: string; createdAt: string }[] }>(
      "/ai/conversations"
    ),

  saveConversation: (data: { messages: { role: string; content: string }[]; personality: string }) =>
    request<{ conversation: { id: string } }>(
      "/ai/conversations", { method: "POST", body: JSON.stringify(data) }
    ),

  deleteConversations: () =>
    request<{ success: boolean }>(
      "/ai/conversations", { method: "DELETE" }
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

  fetchModels: (data: { baseUrl: string; apiKey?: string }) =>
    request<{ models: string[] }>(
      "/users/me/models", { method: "POST", body: JSON.stringify(data) }
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

  createBrainKnowledge: (data: { title: string; description: string; category: string }) =>
    request<{ knowledge: any }>("/ai/knowledge", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateBrainKnowledge: (id: string, data: { title?: string; description?: string; category?: string }) =>
    request<{ knowledge: any }>(`/ai/knowledge/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteBrainKnowledge: (id: string) =>
    request<{ success: boolean }>(`/ai/knowledge/${id}`, { method: "DELETE" }),

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
