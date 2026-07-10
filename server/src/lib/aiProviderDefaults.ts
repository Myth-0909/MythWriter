export const DEFAULT_CHAT_API_KEY = process.env.DEFAULT_CHAT_API_KEY?.trim() || "";
export const DEFAULT_CHAT_API_BASE_URL =
  process.env.DEFAULT_CHAT_API_BASE_URL?.trim() || "https://api.deepseek.com/v1";
export const DEFAULT_CHAT_MODEL =
  process.env.DEFAULT_CHAT_MODEL?.trim() || "deepseek-chat";

export function defaultChatApiKey(value?: string | null): string {
  return value?.trim() || DEFAULT_CHAT_API_KEY;
}

export function defaultChatBaseUrl(value?: string | null): string {
  return value?.trim() || DEFAULT_CHAT_API_BASE_URL;
}

export function defaultChatModel(value?: string | null): string {
  return value?.trim() || DEFAULT_CHAT_MODEL;
}
