import type { Document } from "@/types";

const API_BASE = "http://localhost:3000/api";

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

  createDocument: (data?: { title?: string; content?: string; preview?: string; category?: string }) =>
    request<{ document: Document }>("/documents", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  updateDocument: (id: string, data: Partial<Pick<Document, "title" | "content" | "preview" | "category">>) =>
    request<{ document: Document }>(`/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
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
    request<{ stats: { day: string; date: string; words: number }[] }>("/stats/weekly"),

  aiGreeting: (data: { userName: string; personality: string }) =>
    request<{ greeting: string }>(
      "/ai/greeting", { method: "POST", body: JSON.stringify(data) }
    ),

  aiChat: (data: { messages: { role: string; content: string }[]; personality: string; memoryContext: string }) =>
    request<{ reply: string; action: { type: string; title: string; content: string } | null }>(
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
    request<{ hasKey: boolean; masked: string; baseUrl: string; model: string }>(
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

  verifyPassword: (password: string) =>
    request<{ verified: boolean }>(
      "/auth/verify-password", { method: "POST", body: JSON.stringify({ password }) }
    ),

  logout: () =>
    request<{ success: boolean; message: string }>(
      "/session/logout", { method: "POST" }
    ),
};
