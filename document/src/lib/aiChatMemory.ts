export type MemoryMessage = {
  role: string;
  content: string;
  finalContent?: string;
  isTyping?: boolean;
  interrupted?: boolean;
};

export const AI_CHAT_MEMORY_KEY = "znwriter_ai_memory";
export const AI_CHAT_ACTIVE_CONVERSATION_KEY = "znwriter_ai_active_conversation";
export const MAX_MEMORY_MESSAGES = 40;

export function getScopedAiChatStorageKeys(scope: string): { memory: string; activeConversation: string } | null {
  const normalizedScope = String(scope || "").trim();
  if (!normalizedScope) return null;
  return {
    memory: `${AI_CHAT_MEMORY_KEY}:${normalizedScope}`,
    activeConversation: `${AI_CHAT_ACTIVE_CONVERSATION_KEY}:${normalizedScope}`,
  };
}

export function clearLegacyUnscopedAiChatCache(): void {
  try {
    localStorage.removeItem(AI_CHAT_MEMORY_KEY);
    localStorage.removeItem(AI_CHAT_ACTIVE_CONVERSATION_KEY);
  } catch {
    // ignore
  }
}

function fallbackConversationId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createClientConversationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return fallbackConversationId();
}

export function hasMeaningfulUserTurn(
  messages: Array<{ role: string; content?: string }> | null | undefined
): boolean {
  return Array.isArray(messages)
    && messages.some((message) => message.role === "user" && String(message.content || "").trim().length > 0);
}

export function buildConversationTitle(
  messages: Array<{ role: string; content?: string }>,
  fallback = "Untitled chat"
): string {
  const firstUser = messages.find((m) => m.role === "user" && String(m.content || "").trim());
  const text = String(firstUser?.content || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}

export function hydrateMessagesFromServer(raw: unknown): MemoryMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is MemoryMessage => {
      if (!item || typeof item !== "object") return false;
      const msg = item as MemoryMessage;
      if (!msg.role || typeof msg.content !== "string") return false;
      if (msg.role === "assistant" && msg.isTyping && !String(msg.finalContent || msg.content).trim()) {
        return false;
      }
      return true;
    })
    .map((msg) => {
      if (msg.role !== "assistant") return { ...msg };
      const content = String(msg.finalContent || msg.content || "");
      const { finalContent: _final, isTyping: _typing, ...rest } = msg;
      return { ...rest, content };
    });
}

export function shouldPreferServerConversation(
  serverMessages: Array<{ role: string; content?: string }>,
  localMessages: Array<{ role: string; content?: string }>,
  serverMatchesActiveConversation = true
): boolean {
  if (!hasMeaningfulUserTurn(serverMessages)) return false;
  return serverMatchesActiveConversation || !hasMeaningfulUserTurn(localMessages);
}

export function loadLocalMemoryCache(scope: string): MemoryMessage[] {
  const keys = getScopedAiChatStorageKeys(scope);
  if (!keys) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(keys.memory) || "[]");
    return hydrateMessagesFromServer(parsed);
  } catch {
    return [];
  }
}

export function saveLocalMemoryCache(scope: string, messages: Array<{ role: string; content: string }>): void {
  const keys = getScopedAiChatStorageKeys(scope);
  if (!keys) return;
  try {
    localStorage.setItem(keys.memory, JSON.stringify(messages.slice(-MAX_MEMORY_MESSAGES)));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function clearLocalMemoryCache(scope: string): void {
  const keys = getScopedAiChatStorageKeys(scope);
  if (!keys) return;
  try {
    localStorage.removeItem(keys.memory);
    localStorage.removeItem(keys.activeConversation);
  } catch {
    // ignore
  }
}

export function loadActiveConversationId(scope: string): string | null {
  const keys = getScopedAiChatStorageKeys(scope);
  if (!keys) return null;
  try {
    const id = localStorage.getItem(keys.activeConversation);
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export function saveActiveConversationId(scope: string, id: string | null): void {
  const keys = getScopedAiChatStorageKeys(scope);
  if (!keys) return;
  try {
    if (!id) localStorage.removeItem(keys.activeConversation);
    else localStorage.setItem(keys.activeConversation, id);
  } catch {
    // ignore
  }
}
