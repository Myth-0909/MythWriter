import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";
import {
  DEFAULT_EMBEDDING_API_KEY,
  DEFAULT_EMBEDDING_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
} from "../lib/embedding";

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

export async function getProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      createdAt: true,
      _count: { select: { documents: true } },
    },
  });
}

export async function updateProfile(userId: string, data: {
  name?: string; lang?: string; password?: string; newPassword?: string;
}): Promise<{ error: string; status: number } | { user: NonNullable<Awaited<ReturnType<typeof getProfile>>> }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "用户不存在", status: 404 };

  if (data.newPassword) {
    if (!data.password) return { error: "请输入当前密码", status: 400 };
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) return { error: "当前密码错误", status: 401 };
    if (data.newPassword.length < 6) return { error: "新密码至少6位", status: 400 };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.lang !== undefined && { lang: data.lang }),
      ...(data.newPassword && { password: await bcrypt.hash(data.newPassword, 10) }),
    },
    select: { id: true, name: true, email: true, avatar: true, createdAt: true },
  });

  return { user: updated };
}

export async function uploadAvatar(userId: string, image: string): Promise<
  { error: string; status: number } | { user: { id: string; name: string; email: string; avatar: string | null; createdAt: Date }; avatarUrl: string }
> {
  const matches = image.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  if (!matches) return { error: "图片格式不正确", status: 400 };

  const ext = matches[1] === "png" ? "png" : "jpg";
  const filename = `avatar-${userId}-${Date.now()}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId }, select: { avatar: true },
  });
  if (currentUser?.avatar) {
    const oldPath = path.join(UPLOADS_DIR, currentUser.avatar);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  fs.writeFileSync(filepath, Buffer.from(matches[2], "base64"));

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatar: filename },
    select: { id: true, name: true, email: true, avatar: true, createdAt: true },
  });

  return { user, avatarUrl: `/uploads/${filename}` };
}

const DEFAULT_API_KEY = "sk-7d2a5b1c9e4f8a0b3c6d9e1f2a5b8c4d";
const DEFAULT_API_BASE_URL = "http://172.16.76.112:8000/v1";
const DEFAULT_AI_MODEL = "google/gemma-4-31B-it";

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

function defaultBaseUrl(value?: string | null) {
  return value?.trim() || DEFAULT_API_BASE_URL;
}

function defaultModel(value?: string | null) {
  return value?.trim() || DEFAULT_AI_MODEL;
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

  if (user && (user.apiBaseUrl !== baseUrl || user.aiModel !== model || !user.apiKey)) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(!user.apiKey && { apiKey: DEFAULT_API_KEY }),
        apiBaseUrl: baseUrl,
        aiModel: model,
      },
    });
  }

  const key = user?.apiKey || DEFAULT_API_KEY;
  await saveApiKeyHistory(userId, {
    apiKey: key,
    baseUrl,
    model,
  });

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
  const nextApiKey = data.apiKey !== undefined ? data.apiKey.trim() || DEFAULT_API_KEY : current?.apiKey || DEFAULT_API_KEY;
  const nextBaseUrl = data.baseUrl !== undefined ? data.baseUrl.trim() || DEFAULT_API_BASE_URL : defaultBaseUrl(current?.apiBaseUrl);
  const nextModel = data.model !== undefined ? data.model.trim() || DEFAULT_AI_MODEL : defaultModel(current?.aiModel);

  await prisma.user.update({
    where: { id: userId },
    data: {
      apiKey: nextApiKey,
      apiBaseUrl: nextBaseUrl,
      aiModel: nextModel,
    },
  });
  await saveApiKeyHistory(userId, {
    apiKey: nextApiKey,
    baseUrl: nextBaseUrl,
    model: nextModel,
  });
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
  const key = user?.embeddingApiKey?.trim() || DEFAULT_EMBEDDING_API_KEY;

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
  const nextApiKey = data.apiKey !== undefined
    ? data.apiKey.trim() || null
    : current?.embeddingApiKey || null;
  const nextBaseUrl = data.baseUrl !== undefined
    ? data.baseUrl.trim() || DEFAULT_EMBEDDING_BASE_URL
    : defaultEmbeddingBaseUrl(current?.embeddingBaseUrl);
  const nextModel = data.model !== undefined
    ? data.model.trim() || DEFAULT_EMBEDDING_MODEL
    : defaultEmbeddingModel(current?.embeddingModel);

  await prisma.user.update({
    where: { id: userId },
    data: {
      embeddingApiKey: nextApiKey,
      embeddingBaseUrl: nextBaseUrl,
      embeddingModel: nextModel,
    },
  });
}

async function saveApiKeyHistory(userId: string, data: { apiKey: string; baseUrl: string; model: string }) {
  const existing = await prisma.apiKeyConfigHistory.findFirst({
    where: {
      userId,
      apiKey: data.apiKey,
      apiBaseUrl: data.baseUrl,
      aiModel: data.model,
    },
  });

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
      apiKey: data.apiKey,
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
    masked: maskApiKey(item.apiKey),
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

  await prisma.user.update({
    where: { id: userId },
    data: {
      apiKey: history.apiKey,
      apiBaseUrl: history.apiBaseUrl,
      aiModel: history.aiModel,
    },
  });
  await saveApiKeyHistory(userId, {
    apiKey: history.apiKey,
    baseUrl: history.apiBaseUrl,
    model: history.aiModel,
  });

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
  return user?.apiKey || DEFAULT_API_KEY;
}

export async function fetchModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const response = await fetch(buildModelsUrl(baseUrl), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(apiKey || DEFAULT_API_KEY).trim()}`,
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
