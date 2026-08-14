import { spawnSync } from "node:child_process";
import process from "node:process";
import { loadEnv } from "vite";

const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const configuredBase = String(env.VITE_API_BASE_URL || "").trim();
const allowLocalApi = String(env.VITE_DESKTOP_ALLOW_LOCAL_API || "").toLowerCase() === "true";

if (!configuredBase && !allowLocalApi) {
  console.error(
    "[desktop build] VITE_API_BASE_URL is required. Add the hosted API URL to .env.production, " +
    "or set VITE_DESKTOP_ALLOW_LOCAL_API=true only for a package that will always run beside the local server."
  );
  process.exit(1);
}

if (configuredBase) {
  let parsed;
  try {
    parsed = new URL(configuredBase);
  } catch {
    console.error("[desktop build] VITE_API_BASE_URL must be an absolute URL.");
    process.exit(1);
  }
  if (parsed.protocol !== "https:" && !allowLocalApi) {
    console.error("[desktop build] The packaged desktop app requires an HTTPS API URL.");
    process.exit(1);
  }
}

const result = spawnSync("pnpm", ["build"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
