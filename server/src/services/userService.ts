import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";
import {
  DEFAULT_EMBEDDING_API_KEY,
  DEFAULT_EMBEDDING_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
} from "../lib/embedding";
import { DEFAULT_FONT_FAMILY_KEY, normalizeFontFamilyKey } from "../lib/fontPreferences";
import { t } from "../lib/i18n";
import {
  defaultChatApiKey,
  defaultChatBaseUrl,
  defaultChatModel,
} from "../lib/aiProviderDefaults";
import { assertAiProviderHttpUrl } from "../lib/safeOutboundUrl";
import { decryptSecret, encryptSecret } from "../lib/secretCipher";

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

export async function getProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      fontFamilyKey: true,
      createdAt: true,
      _count: { select: { documents: true } },
    },
  });
}

export async function updateProfile(userId: string, data: {
  name?: string; lang?: string; timeZone?: string; password?: string; newPassword?: string; fontFamilyKey?: string;
}, responseLang = "zh"): Promise<{ error: string; status: number } | { user: NonNullable<Awaited<ReturnType<typeof getProfile>>> }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: t(responseLang, "用户不存在", "User not found"), status: 404 };

  const nextFontFamilyKey = data.fontFamilyKey === undefined
    ? undefined
    : normalizeFontFamilyKey(data.fontFamilyKey);
  if (data.fontFamilyKey !== undefined && !nextFontFamilyKey) {
    return {
      error: t(responseLang, "字体设置无效", "Invalid font setting"),
      status: 400,
    };
  }

  if (data.timeZone !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: data.timeZone }).format();
    } catch {
      return { error: t(responseLang, "时区设置无效", "Invalid time zone"), status: 400 };
    }
  }

  if (data.newPassword) {
    if (!data.password) return { error: t(responseLang, "请输入当前密码", "Enter your current password"), status: 400 };
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) return { error: t(responseLang, "当前密码错误", "Current password is incorrect"), status: 401 };
    if (data.newPassword.length < 6) return { error: t(responseLang, "新密码至少6位", "New password must be at least 6 characters"), status: 400 };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.lang !== undefined && { lang: data.lang }),
      ...(data.timeZone !== undefined && { timeZone: data.timeZone }),
      ...(nextFontFamilyKey !== undefined && { fontFamilyKey: nextFontFamilyKey }),
      ...(data.newPassword && { password: await bcrypt.hash(data.newPassword, 10) }),
      ...(data.newPassword && { sessionVersion: { increment: 1 } }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      fontFamilyKey: true,
      createdAt: true,
      _count: { select: { documents: true } },
    },
  });

  return {
    user: {
      ...updated,
      fontFamilyKey: updated.fontFamilyKey || DEFAULT_FONT_FAMILY_KEY,
    },
  };
}

export async function uploadAvatar(userId: string, image: string, responseLang = "zh"): Promise<
  { error: string; status: number } | { user: { id: string; name: string; email: string; avatar: string | null; createdAt: Date }; avatarUrl: string }
> {
  const matches = image.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!matches) {
    return { error: t(responseLang, "仅支持 PNG、JPEG 或 WebP 图片", "Only PNG, JPEG, or WebP images are supported"), status: 400 };
  }

  const declaredType = matches[1].toLowerCase();
  const buffer = Buffer.from(matches[2], "base64");
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    return { error: t(responseLang, "图片大小不能超过 2MB", "Image must be no larger than 2MB"), status: 400 };
  }
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  const typeMatches = declaredType === "png" ? isPng : declaredType === "webp" ? isWebp : isJpeg;
  if (!typeMatches) {
    return { error: t(responseLang, "图片内容与文件格式不匹配", "Image content does not match its file type"), status: 400 };
  }

  const ext = declaredType === "png" ? "png" : declaredType === "webp" ? "webp" : "jpg";
  const filename = `avatar-${userId}-${Date.now()}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  const temporaryPath = `${filepath}.${process.pid}.tmp`;

  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

  const currentUser = await prisma.user.findUnique({
    where: { id: userId }, select: { avatar: true },
  });
  await fs.promises.writeFile(temporaryPath, buffer, { flag: "wx" });
  await fs.promises.rename(temporaryPath, filepath);

  let user;
  try {
    user = await prisma.user.update({
      where: { id: userId },
      data: { avatar: filename },
      select: { id: true, name: true, email: true, avatar: true, createdAt: true },
    });
  } catch (error) {
    await fs.promises.unlink(filepath).catch(() => {});
    throw error;
  }

  if (currentUser?.avatar && path.basename(currentUser.avatar) === currentUser.avatar) {
    const oldPath = path.join(UPLOADS_DIR, currentUser.avatar);
    await fs.promises.unlink(oldPath).catch(() => {});
  }

  return { user, avatarUrl: `/uploads/${filename}` };
}

type ApiKeyHistoryRecord = {
  id: string;
  apiKey: string;
  apiBaseUrl: string;
  aiModel: string;
  updatedAt: Date;
};

function buildModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/models")) return trimmed;
  // DeepSeek exposes /models at root level, not under /v1
  if (trimmed.includes("api.deepseek.com")) {
    return trimmed.replace(/\/v1\/?$/, "").replace(/\/+$/, "") + "/models";
  }
  return `${trimmed}/models`;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function extractMessageContent(message: any): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part: any) => {
        if (typeof part === "string") return part;
        return part?.text || part?.content || "";
      })
      .join("");
  }
  return "";
}

function extractChatReplyFromJson(payload: any): string {
  const choice = payload?.choices?.[0];
  const choiceText =
    extractMessageContent(choice?.message) ||
    extractMessageContent(choice?.delta) ||
    choice?.text ||
    payload?.output_text;

  if (choiceText) return String(choiceText).trim();

  if (Array.isArray(payload?.output)) {
    return payload.output
      .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .map((part: any) => part?.text || part?.content || "")
      .join("")
      .trim();
  }

  return "";
}

function cleanChatReply(value: string): string {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/^\s*(?:assistant|回复|模型回复)[:：]\s*/i, "")
    .trim();
}

function extractChatReplyFromText(rawText: string): string {
  const text = rawText.trim();
  if (!text) return "";

  try {
    return cleanChatReply(extractChatReplyFromJson(JSON.parse(text)));
  } catch {
    // Continue with SSE/plain-text parsing below.
  }

  let streamed = "";
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      streamed += extractChatReplyFromJson(JSON.parse(data));
    } catch {
      streamed += data;
    }
  }

  return cleanChatReply(streamed || text);
}

function defaultBaseUrl(value?: string | null) {
  return defaultChatBaseUrl(value);
}

function defaultModel(value?: string | null) {
  return defaultChatModel(value);
}

function defaultEmbeddingBaseUrl(value?: string | null) {
  return value?.trim() || DEFAULT_EMBEDDING_BASE_URL;
}

function defaultEmbeddingModel(value?: string | null) {
  return value?.trim() || DEFAULT_EMBEDDING_MODEL;
}

export async function getApiKey(userId: string): Promise<{
  hasKey: boolean;
  masked: string;
  baseUrl: string;
  model: string;
  histories: Array<{ id: string; masked: string; baseUrl: string; model: string; updatedAt: Date }>;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKey: true, apiBaseUrl: true, aiModel: true },
  });
  const baseUrl = defaultBaseUrl(user?.apiBaseUrl);
  const model = defaultModel(user?.aiModel);

  if (user && (user.apiBaseUrl !== baseUrl || user.aiModel !== model)) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        apiBaseUrl: baseUrl,
        aiModel: model,
      },
    });
  }

  const key = defaultChatApiKey(decryptSecret(user?.apiKey));
  if (key) {
    await saveApiKeyHistory(userId, {
      apiKey: key,
      baseUrl,
      model,
    });
  }

  const histories = await listApiKeyHistories(userId);
  return {
    hasKey: !!key,
    masked: key ? key.slice(0, 3) + "****" + key.slice(-4) : "",
    baseUrl,
    model,
    histories,
  };
}

export async function saveApiKey(userId: string, data: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKey: true, apiBaseUrl: true, aiModel: true },
  });
  // When apiKey is provided we store its encrypted form; when omitted we keep
  // the existing (already-encrypted) value untouched to avoid double-encryption.
  const plainApiKey = data.apiKey !== undefined
    ? (data.apiKey.trim() || null)
    : (decryptSecret(current?.apiKey) || null);
  const storedApiKey = data.apiKey !== undefined
    ? (plainApiKey ? encryptSecret(plainApiKey) : null)
    : (current?.apiKey || null);
  const nextBaseUrl = data.baseUrl !== undefined ? data.baseUrl.trim() || defaultBaseUrl() : defaultBaseUrl(current?.apiBaseUrl);
  const nextModel = data.model !== undefined ? data.model.trim() || defaultModel() : defaultModel(current?.aiModel);

  await prisma.user.update({
    where: { id: userId },
    data: {
      apiKey: storedApiKey,
      apiBaseUrl: nextBaseUrl,
      aiModel: nextModel,
    },
  });
  if (plainApiKey) {
    await saveApiKeyHistory(userId, {
      apiKey: plainApiKey,
      baseUrl: nextBaseUrl,
      model: nextModel,
    });
  }
}

function maskApiKey(key: string) {
  return key ? key.slice(0, 3) + "****" + key.slice(-4) : "";
}

export async function getEmbeddingConfig(userId: string): Promise<{
  hasKey: boolean;
  masked: string;
  baseUrl: string;
  model: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { embeddingApiKey: true, embeddingBaseUrl: true, embeddingModel: true },
  });
  const baseUrl = defaultEmbeddingBaseUrl(user?.embeddingBaseUrl);
  const model = defaultEmbeddingModel(user?.embeddingModel);
  const key = decryptSecret(user?.embeddingApiKey).trim() || DEFAULT_EMBEDDING_API_KEY;

  if (user && (user.embeddingBaseUrl !== baseUrl || user.embeddingModel !== model)) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        embeddingBaseUrl: baseUrl,
        embeddingModel: model,
      },
    });
  }

  return {
    hasKey: !!key,
    masked: maskApiKey(key),
    baseUrl,
    model,
  };
}

export async function saveEmbeddingConfig(userId: string, data: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}) {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { embeddingApiKey: true, embeddingBaseUrl: true, embeddingModel: true },
  });
  // Encrypt a newly provided key; otherwise keep the stored (encrypted) value.
  const storedApiKey = data.apiKey !== undefined
    ? (data.apiKey.trim() ? encryptSecret(data.apiKey.trim()) : null)
    : (current?.embeddingApiKey || null);
  const nextBaseUrl = data.baseUrl !== undefined
    ? data.baseUrl.trim() || DEFAULT_EMBEDDING_BASE_URL
    : defaultEmbeddingBaseUrl(current?.embeddingBaseUrl);
  const nextModel = data.model !== undefined
    ? data.model.trim() || DEFAULT_EMBEDDING_MODEL
    : defaultEmbeddingModel(current?.embeddingModel);

  await prisma.user.update({
    where: { id: userId },
    data: {
      embeddingApiKey: storedApiKey,
      embeddingBaseUrl: nextBaseUrl,
      embeddingModel: nextModel,
    },
  });
}

async function saveApiKeyHistory(userId: string, data: { apiKey: string; baseUrl: string; model: string }) {
  // apiKey arrives as plaintext; stored ciphertext uses a random IV so we can
  // not dedup with a DB equality filter — decrypt candidates and compare.
  const candidates: Array<{ id: string; apiKey: string; apiBaseUrl: string; aiModel: string }> =
    await prisma.apiKeyConfigHistory.findMany({
      where: { userId, apiBaseUrl: data.baseUrl, aiModel: data.model },
      select: { id: true, apiKey: true, apiBaseUrl: true, aiModel: true },
    });
  const existing = candidates.find((item) => decryptSecret(item.apiKey) === data.apiKey);

  if (existing) {
    await prisma.apiKeyConfigHistory.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
    });
    return;
  }

  await prisma.apiKeyConfigHistory.create({
    data: {
      userId,
      apiKey: encryptSecret(data.apiKey),
      apiBaseUrl: data.baseUrl,
      aiModel: data.model,
    },
  });
}

export async function listApiKeyHistories(userId: string) {
  const histories: ApiKeyHistoryRecord[] = await prisma.apiKeyConfigHistory.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, apiKey: true, apiBaseUrl: true, aiModel: true, updatedAt: true },
  });

  return histories.map((item: ApiKeyHistoryRecord) => ({
    id: item.id,
    masked: maskApiKey(decryptSecret(item.apiKey)),
    baseUrl: item.apiBaseUrl,
    model: item.aiModel,
    updatedAt: item.updatedAt,
  }));
}

export async function applyApiKeyHistory(userId: string, historyId: string) {
  const history = await prisma.apiKeyConfigHistory.findFirst({
    where: { id: historyId, userId },
    select: { apiKey: true, apiBaseUrl: true, aiModel: true },
  });
  if (!history) return null;

  const plainApiKey = decryptSecret(history.apiKey);
  await prisma.user.update({
    where: { id: userId },
    data: {
      apiKey: plainApiKey ? encryptSecret(plainApiKey) : null,
      apiBaseUrl: history.apiBaseUrl,
      aiModel: history.aiModel,
    },
  });
  if (plainApiKey) {
    await saveApiKeyHistory(userId, {
      apiKey: plainApiKey,
      baseUrl: history.apiBaseUrl,
      model: history.aiModel,
    });
  }

  return getApiKey(userId);
}

export async function deleteApiKeyHistory(userId: string, historyId: string) {
  const history = await prisma.apiKeyConfigHistory.findFirst({
    where: { id: historyId, userId },
    select: { id: true },
  });
  if (!history) return false;

  await prisma.apiKeyConfigHistory.delete({
    where: { id: history.id },
  });

  return true;
}

export async function getApiKeySecret(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKey: true },
  });
  return defaultChatApiKey(decryptSecret(user?.apiKey));
}

export async function fetchModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const key = defaultChatApiKey(apiKey);
  assertAiProviderHttpUrl(baseUrl);
  const response = await fetch(buildModelsUrl(baseUrl), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(key && { Authorization: `Bearer ${key}` }),
    },
  });

  if (!response.ok) {
    throw new Error(`Model endpoint returned ${response.status}`);
  }

  const payload = await response.json() as {
    data?: Array<{ id?: string; name?: string; model?: string } | string>;
    models?: Array<{ id?: string; name?: string; model?: string } | string>;
  };
  const items = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];

  return items
    .map((item) => {
      if (typeof item === "string") return item;
      return item.id || item.name || item.model || "";
    })
    .filter(Boolean);
}

export async function testChatModel(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  prompt?: string;
}): Promise<{ reply: string; model: string }> {
  const key = defaultChatApiKey(params.apiKey);
  const model = defaultChatModel(params.model);
  assertAiProviderHttpUrl(params.baseUrl);
  const response = await fetch(buildChatCompletionsUrl(params.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key && { Authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: params.prompt?.trim() || "你好！" },
      ],
      temperature: 0.2,
      max_tokens: 80,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Chat endpoint returned ${response.status}: ${text.slice(0, 160)}`);
  }

  const responseText = await response.text();
  const reply = extractChatReplyFromText(responseText);
  let responseModel = model;
  try {
    const payload = JSON.parse(responseText);
    responseModel = String(payload.model || responseModel);
  } catch {
    // A 200 response with plain text or SSE still proves connectivity.
  }

  return {
    reply,
    model: responseModel,
  };
}
