const DEFAULT_API_PORT = "3000";
const API_PREFIX = "/api";

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.endsWith(API_PREFIX) ? trimmed : `${trimmed}${API_PREFIX}`;
}

export function getApiBaseUrl(): string {
  const configuredBase = import.meta.env.VITE_API_BASE_URL;
  if (typeof configuredBase === "string" && configuredBase.trim()) {
    return normalizeApiBaseUrl(configuredBase);
  }

  if (typeof window !== "undefined" && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}${API_PREFIX}`;
  }

  return `http://localhost:${DEFAULT_API_PORT}${API_PREFIX}`;
}

export const API_BASE = getApiBaseUrl();

export function getServerAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE.replace(/\/api$/, "")}${normalizedPath}`;
}
