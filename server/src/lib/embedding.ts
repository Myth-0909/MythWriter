import prisma from "./prisma";

export const DEFAULT_EMBEDDING_BASE_URL =
  process.env.EMBEDDING_BASE_URL || "http://172.16.76.112:8001/v1";
export const DEFAULT_EMBEDDING_API_KEY =
  process.env.EMBEDDING_API_KEY || "sk-4f8a7b2c9d1e6f3a5b8c2d7e9f4a6b3c";
export const DEFAULT_EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "Qwen/Qwen3-Embedding-8B";

export type EmbeddingConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type EmbeddingUserSettings = {
  embeddingApiKey?: string | null;
  embeddingBaseUrl?: string | null;
  embeddingModel?: string | null;
};

export type EmbeddingSettingsLoader = (userId: string) => Promise<EmbeddingUserSettings | null>;

type FetchResponse = {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
};

export type EmbeddingFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  }
) => Promise<FetchResponse>;

function cleanSetting(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function resolveEmbeddingConfig(settings: EmbeddingUserSettings = {}): EmbeddingConfig {
  return {
    apiKey: cleanSetting(settings.embeddingApiKey, DEFAULT_EMBEDDING_API_KEY),
    baseUrl: cleanSetting(settings.embeddingBaseUrl, DEFAULT_EMBEDDING_BASE_URL),
    model: cleanSetting(settings.embeddingModel, DEFAULT_EMBEDDING_MODEL),
  };
}

async function loadUserEmbeddingSettings(userId: string): Promise<EmbeddingUserSettings | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      embeddingApiKey: true,
      embeddingBaseUrl: true,
      embeddingModel: true,
    },
  });
}

export async function getUserEmbeddingConfig(
  userId: string,
  loader: EmbeddingSettingsLoader = loadUserEmbeddingSettings
): Promise<EmbeddingConfig> {
  const settings = await loader(userId);
  return resolveEmbeddingConfig(settings || {});
}

function buildEmbeddingsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/embeddings")) return trimmed;
  return `${trimmed}/embeddings`;
}

function getDefaultFetch(): EmbeddingFetch {
  if (typeof fetch !== "function") {
    throw new Error("Embedding fetch is not available in this Node.js runtime");
  }
  return fetch as unknown as EmbeddingFetch;
}

function isNumberVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

async function readErrorBody(response: FetchResponse): Promise<string> {
  try {
    return response.text ? await response.text() : "";
  } catch {
    return "";
  }
}

export async function generateEmbeddings(
  texts: string[],
  config: Partial<EmbeddingConfig> = {},
  fetcher: EmbeddingFetch = getDefaultFetch()
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const resolved = {
    ...resolveEmbeddingConfig(),
    ...config,
  };

  const response = await fetcher(buildEmbeddingsUrl(resolved.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolved.apiKey}`,
    },
    body: JSON.stringify({
      model: resolved.model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const detail = await readErrorBody(response);
    const status = response.status ? ` ${response.status}` : "";
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(`Embedding request failed:${status}${statusText}${detail ? ` - ${detail}` : ""}`);
  }

  const payload = await response.json();
  const data = (payload as { data?: Array<{ embedding?: unknown }> }).data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error("Invalid embedding response: data length mismatch");
  }

  return data.map((item) => {
    if (!isNumberVector(item.embedding)) {
      throw new Error("Invalid embedding response: embedding must be a number array");
    }
    return item.embedding;
  });
}

export async function generateEmbedding(
  text: string,
  config?: Partial<EmbeddingConfig>,
  fetcher?: EmbeddingFetch
): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text], config, fetcher);
  return embedding;
}
