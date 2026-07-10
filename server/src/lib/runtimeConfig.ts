import { mkdirSync } from "node:fs";
import path from "node:path";

export const DEFAULT_LOCAL_SQLITE_DATABASE_URL = "file:../data/prowriter.db";
export const DEFAULT_JWT_SECRET = "prowriter-jwt-secret-key-2024";

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function applyRuntimeConfigDefaults(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv = env.NODE_ENV
): void {
  if (nodeEnv === "production") return;

  if (!hasValue(env.SQLITE_DATABASE_URL)) {
    env.SQLITE_DATABASE_URL = DEFAULT_LOCAL_SQLITE_DATABASE_URL;
  }
  if (!hasValue(env.NODE_USE_ENV_PROXY)) {
    env.NODE_USE_ENV_PROXY = "1";
  }
  if (!hasValue(env.JWT_SECRET)) {
    env.JWT_SECRET = DEFAULT_JWT_SECRET;
  }
}

export function ensureLocalDataDir(serverRoot = path.resolve(__dirname, "..", "..")): string {
  const dataDir = path.join(serverRoot, "data");
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}
